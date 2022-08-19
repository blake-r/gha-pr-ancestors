import * as core from "@actions/core";
import * as github from "@actions/github";
import {PullRequestChangedFile, Repository} from "@octokit/graphql-schema";
import {GitHub} from "@actions/github/lib/utils";
import {GraphQlQueryResponseData} from "@octokit/graphql/dist-types/types";


async function main() {
    const owner = core.getInput("owner");
    const repository = core.getInput("repository");
    const token = core.getInput("token");
    const pullNumber = parseInt(core.getInput("pull_number"))
    const octokit = github.getOctokit(token);
    const params = [octokit, owner, repository, pullNumber] as const;
    const changedFiles = await fetchPullRequestChangedFiles(...params)
    for (const changedFile of changedFiles) {
        await fetchChangedLineParents(...params, changedFile.path);
    }
}

async function fetchPullRequestChangedFiles(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number): Promise<PullRequestChangedFile[]> {
    let after: string = null;
    const query = `
        query pullRequestFiles($owner: String!, $repo: String!, $pullNumber: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    files(first: 100, after: $after) {
                        nodes { path }
                        pageInfo { endCursor }
                    }
                }
            }
        }
    `;
    const changedFiles = new Array<PullRequestChangedFile>(0);
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
        repository.pullRequest.files.nodes.forEach(changedFile => changedFiles.push(changedFile));
        after = repository.pullRequest.files.pageInfo.endCursor;
        if (!after) {
            break;
        }
    }
    return changedFiles;
}

async function fetchChangedLineParents(octokit: InstanceType<typeof GitHub>, owner: string, repo: string, pullNumber: number, changedFilePath: string) {
    const query = `
        query pullRequestFileBlame($owner: String!, $repo: String!, $pullNumber: Int!, $changedFilePath: String!) {    
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pullNumber) {
                    commits(first: 100) {
                        id
                    }
                    potentialMergeCommit {
                    # mergeCommit {
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
    core.info(`Getting merge commit history for file ${changedFilePath}`)
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
    core.info(`Pull request commit ids: ${pullRequestCommitIds}`);
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
