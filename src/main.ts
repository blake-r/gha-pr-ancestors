import * as core from "@actions/core";
import * as github from "@actions/github";
import {PullRequestChangedFile, PullRequestCommit, Repository} from "@octokit/graphql-schema";
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
    let after: string = null;
    const query = `
        query ($owner: String!, $repo: String!, $pullNumber: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    merged
                    potentialMergeCommit {
                        id
                    }
                    mergeCommit {
                        id
                    }
                    commits(first: 100, after: $after) {
                        nodes {
                            id
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
        const repository = data.repository as Repository;
        core.info(JSON.stringify(data, null, 2));
        if (!pullCommitIds.length) {
            pullCommitIds.push(
                repository.pullRequest.mergeCommit?.id,
                repository.pullRequest.potentialMergeCommit?.id,
            );
        }
        pullCommitIds.push(...repository.pullRequest.commits.nodes.map(commit => commit.id));
        if (!(after = repository.pullRequest.commits.pageInfo.endCursor)) {
            break;
        }
    }
    core.info("Pull request commit ids:\n" + JSON.stringify(pullCommitIds, null, 2));
    return pullCommitIds;
}

async function fetchPullRequestChangedFilePaths(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number): Promise<string[]> {
    let after: string = null;
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
        changedFilePaths.push(...repository.pullRequest.files.nodes.map(changedFile => changedFile.path));
        if (!(after = repository.pullRequest.files.pageInfo.endCursor)) {
            break;
        }
    }
    core.info("Pull request changed file paths:\n" + JSON.stringify(changedFilePaths, null, 2));
    return changedFilePaths;
}

async function fetchChangedLineParents(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number, pullCommitIds: string[], changedFilePath: string) {
    const mergeCommitType = pullCommitIds[0] ? "mergeCommit" : "potentialMergeCommit";
    const query = `
        query ($owner: String!, $repo: String!, $pullNumber: Int!, $changedFilePath: String!) {    
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    ${mergeCommitType} {
                        id
                        history(first: 2, path: $changedFilePath) {
                            nodes {
                                blame(path: $changedFilePath) {
                                    ranges {
                                        startingLine
                                        endingLine
                                        commit {
                                            id
                                            messageHeadline
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    core.info(`Getting merge commit history for file ${changedFilePath} of ${mergeCommitType}`)
    const data = await octokit.graphql<GraphQlQueryResponseData>({
        query: query,
        owner: owner,
        repo: repo,
        pullNumber: pullNumber,
        changedFilePath: changedFilePath,
    });
    core.debug(JSON.stringify(data, null, 2));
    const repository = data.repository as Repository;
    const mergeCommit = repository.pullRequest.mergeCommit || repository.pullRequest.potentialMergeCommit;
    const pullRequestCommitIds = [mergeCommit.id, ...repository.pullRequest.commits.nodes.map(commit => commit.id)];
    const changedLines: number[] = [];
    mergeCommit.history.nodes.forEach(commit => {
        commit.blame.ranges.forEach(blame => {
            const startingLine = blame.startingLine;
            const endingLine = blame.endingLine;
            if (blame.commit.id in pullRequestCommitIds) {
                changedLines.push(startingLine, endingLine);
            } else {
                for (const lineNumber of changedLines) {
                    if (lineNumber <= startingLine && lineNumber <= endingLine) {
                        console.log(`Caught: ${blame.commit.messageHeadline}`)
                        break
                    }
                }
            }
        })
    })
}

main().catch(error => {
    console.error(error);
    core.setFailed(error.message);
});
