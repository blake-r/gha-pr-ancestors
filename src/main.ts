import * as core from "@actions/core";
import * as github from "@actions/github";
import {Commit, PullRequestChangedFile, PullRequestCommit, Repository} from "@octokit/graphql-schema";
import {GitHub} from "@actions/github/lib/utils";
import {GraphQlQueryResponseData} from "@octokit/graphql/dist-types/types";


async function main() {
    const owner = core.getInput("owner");
    const repository = core.getInput("repository");
    const token = core.getInput("token");
    const pullNumber = parseInt(core.getInput("pull_number"))
    const octokit = github.getOctokit(token);
    const params = [octokit, owner, repository, pullNumber] as const;
    const pullCommitIds = await fetchPullRequestCommitIds(...params);
    const changedFilePaths = await fetchPullRequestChangedFilePaths(...params)
    for (const changedFilePath of changedFilePaths) {
        await fetchChangedLineParents(...params, pullCommitIds, changedFilePath);
    }
}

async function fetchPullRequestCommitIds(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number): Promise<string[]> {
    let after = null as string;
    const query = `
        query ($owner: String!, $repo: String!, $pullNumber: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    potentialMergeCommit {
                        oid
                    }
                    mergeCommit {
                        oid
                    }
                    commits(first: 100, after: $after) {
                        nodes {
                            commit {
                                oid
                            }
                        }
                        pageInfo {
                            endCursor
                        }
                    }
                }
            }
        }
    `;
    const pullCommitIds = [] as string[];
    for (;;) {
        core.info(`Getting pull request commits starting from ${after}`)
        const data = await octokit.graphql<GraphQlQueryResponseData>({
            query: query,
            owner: owner,
            repo: repo,
            pullNumber: pullNumber,
            after: after,
        });
        core.debug(JSON.stringify(data, null, 2));
        const repository = data.repository as Repository;
        if (!(after = repository.pullRequest.commits.pageInfo.endCursor)) {
            break;
        }
        if (!pullCommitIds.length) {
            pullCommitIds.push(
                repository.pullRequest.mergeCommit?.oid,
                repository.pullRequest.potentialMergeCommit?.oid,
            );
        }
        pullCommitIds.push(...repository.pullRequest.commits.nodes.map(commit => commit.commit.oid));
    }
    core.info("Pull request commit ids:\n" + JSON.stringify(pullCommitIds, null, 2));
    return pullCommitIds;
}

async function fetchPullRequestChangedFilePaths(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number): Promise<string[]> {
    let after = null as string;
    const query = `
        query ($owner: String!, $repo: String!, $pullNumber: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    files(first: 100, after: $after) {
                        nodes {
                            path
                        }
                        pageInfo {
                            endCursor
                        }
                    }
                }
            }
        }
    `;
    const changedFilePaths = [] as string[];
    for (;;) {
        core.info(`Getting pull request files starting from ${after}`);
        const data = await octokit.graphql<GraphQlQueryResponseData>({
            query: query,
            owner: owner,
            repo: repo,
            pullNumber: pullNumber,
            after: after,
        });
        core.debug(JSON.stringify(data, null, 2));
        const repository = data.repository as Repository;
        if (!(after = repository.pullRequest.files.pageInfo.endCursor)) {
            break;
        }
        changedFilePaths.push(...repository.pullRequest.files.nodes.map(changedFile => changedFile.path));
    }
    core.info("Pull request changed file paths:\n" + JSON.stringify(changedFilePaths, null, 2));
    return changedFilePaths;
}

async function fetchChangedLineParents(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number, pullCommitIds: string[], changedFilePath: string) {
    const mergeCommitType = pullCommitIds[0] ? "mergeCommit" : "potentialMergeCommit";
    let after = null as string;
    const query = `
        query ($owner: String!, $repo: String!, $pullNumber: Int!, $after: String, $changedFilePath: String!) {    
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    ${mergeCommitType} {
                        history(first: 100, after: $after, path: $changedFilePath) {
                            nodes {
                                oid
                                blame(path: $changedFilePath) {
                                    ranges {
                                        startingLine
                                        endingLine
                                        commit {
                                            oid
                                            messageHeadline
                                        }
                                    }
                                }
                            }
                            pageInfo {
                                endCursor
                            }
                        }
                    }
                }
            }
        }
    `;
    let firstCommit = null as Commit;
    let lastCommit = null as Commit;
    for (;;) {
        core.info(`Getting history for file "${changedFilePath}" of ${mergeCommitType} starting from ${after}`)
        const data = await octokit.graphql<GraphQlQueryResponseData>({
            query: query,
            owner: owner,
            repo: repo,
            pullNumber: pullNumber,
            after: after,
            changedFilePath: changedFilePath,
        });
        core.debug(JSON.stringify(data, null, 2));
        const repository = data.repository as Repository;
        const mergeCommit = repository.pullRequest.mergeCommit || repository.pullRequest.potentialMergeCommit;
        if (!(after = mergeCommit.history.pageInfo.endCursor)) {
            break;
        }
        for (const historyCommit of mergeCommit.history.nodes) {
            if (pullCommitIds.indexOf(historyCommit.oid) === -1) {
                core.info(`Ancestor commit reached`);
                lastCommit = historyCommit;
                break;
            }
            if (!firstCommit) {
                core.info(`First commit set`);
                firstCommit = historyCommit;
            }
        }
    }
    if (!firstCommit) {
        core.warning(`Pull request file "${changedFilePath}" history not found`);
        return
    }
    if (!lastCommit) {
        core.info(`Pull request file "${changedFilePath}" is a new one`);
        return
    }
    core.info("First commit:\n" + JSON.stringify(firstCommit, null, 2));
    core.info("Ancestor commit:\n" + JSON.stringify(lastCommit, null, 2));
}

main().catch(error => {
    console.error(error);
    core.setFailed(error.message);
});
