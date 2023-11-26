import * as core from '@actions/core'
import { Octokit } from '@octokit/core'
import * as fs from 'fs'
import * as path from 'path'
import * as Buffer from 'buffer'

interface Comment {
  type: string
  content: string
  file: string
  line: number
  message: string
  key: string
}

interface GitHubIssue {
  id: number
  title: string
  body: string
  key: string // Assuming issues have a key to identify them, perhaps in the body or a label
}

/**
 * Read and return content of a file.
 */
async function readFileContent(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf8')
}

/**
 * Extracts comments from a file content based on given prefixes.
 */
function extractComments(
  fileContent: string,
  filePath: string,
  prefixes: string[]
): Comment[] {
  const commentRegex = new RegExp('(' + prefixes.join('|') + '):\\s*(.*)', 'g')
  const lines = fileContent.split('\n')
  const comments: Comment[] = []

  lines.forEach((line, index) => {
    let match
    while ((match = commentRegex.exec(line)) !== null) {
      const contextStart = Math.max(index - 5, 0)
      const contextEnd = Math.min(index + 5, lines.length - 1)
      const context = lines.slice(contextStart, contextEnd + 1).join('\n')
      const key = Buffer.Buffer.from(`${filePath}:${index + 1}`).toString(
        'base64'
      )

      comments.push({
        type: match[1],
        content: match[2],
        file: filePath,
        line: index + 1,
        message: context,
        key: key
      })
    }
  })

  return comments
}

/**
 * Generate issue title and description using ChatGPT
 */
async function generateIssueContent(
  comment: Comment
): Promise<{ title: string; description: string }> {
  // Call ChatGPT API here to generate issue content
  // This is a placeholder implementation
  return {
    title: `${comment.type} in ${path.basename(comment.file)} at line ${
      comment.line
    }`,
    description: `Found a ${comment.type} comment:\n\n> ${comment.content}\n\nContext:\n${comment.message}\n\nThis issue was generated automatically from a source code comment.\n\n=== DO NOT REMOVE ===\nKey: ${comment.key}`
  }
}

/**
 * Fetch existing GitHub issues.
 */
async function fetchExistingIssues(): Promise<GitHubIssue[]> {
  const octokit = new Octokit({ auth: core.getInput('github-token') })
  const owner = core.getInput('github-owner')
  const repo = core.getInput('github-repo')
  const issues = await octokit.request('GET /repos/{owner}/{repo}/issues', {
    owner,
    repo
  })
  return issues.data.map((issue: any) => ({
    title: issue.title,
    body: issue.body,
    key: parseIssueKey(issue.body),
    id: issue.number
  }))
}

/**
 * Parse a Github issue body and return the key
 * @param body
 * @returns {string}
 */
function parseIssueKey(body: string): string {
  const match = body.match(/Key: (.*)/)
  return match ? match[1] : ''
}

/**
 * Create a GitHub issue
 */
async function createGitHubIssue(title: string, description: string) {
  const octokit = new Octokit({ auth: core.getInput('github-token') })
  const owner = core.getInput('github-owner')
  const repo = core.getInput('github-repo')
  await octokit.request('POST /repos/{owner}/{repo}/issues', {
    owner,
    repo,
    title,
    body: description
  })
}

/**
 * Update a GitHub issue
 */
async function updateGitHubIssue(
  issueId: number,
  title: string,
  description: string
) {
  const octokit = new Octokit({ auth: core.getInput('github-token') })
  const owner = core.getInput('github-owner')
  const repo = core.getInput('github-repo')
  await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
    owner,
    repo,
    issue_number: issueId,
    title,
    body: description
  })
}

/**
 * Close a GitHub issue
 * @param issueId
 * @returns {Promise<void>}
 */
async function closeGithubIssue(issueId: number) {
  const octokit = new Octokit({ auth: core.getInput('github-token') })
  const owner = core.getInput('github-owner')
  const repo = core.getInput('github-repo')
  await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
    owner,
    repo,
    issue_number: issueId,
    state: 'closed'
  })
}

/**
 * The main function for the action.
 * @param {string[]} prefixes - Array of comment prefixes to look for.
 */
export async function run(): Promise<void> {
  try {
    const prefixes = core
      .getInput('comment-prefixes')
      .split(',')
      .map(prefix => prefix.trim())
    const existingIssues = await fetchExistingIssues()
    const sourceFiles = await listAllSourceFiles(
      core.getInput('source-directory'),
      core.getInput('file-extension') || '.ts'
    )
    const foundComments: Comment[] = []

    for (const file of sourceFiles) {
      const content = await readFileContent(file)
      const comments = extractComments(content, file, prefixes)
      foundComments.push(...comments)
    }

    // Process each found comment
    for (const comment of foundComments) {
      const { title, description } = await generateIssueContent(comment)
      const existingIssue = existingIssues.find(
        issue => issue.key === comment.key
      )

      if (existingIssue) {
        // Update existing issue
        await updateGitHubIssue(existingIssue.id, title, description)
      } else {
        // Create new issue
        await createGitHubIssue(title, description)
      }
    }

    // Check for issues to close (existing issues not found in current comments)
    const issuesToClose = existingIssues.filter(
      issue => !foundComments.some(comment => comment.key === issue.key)
    )
    for (const issue of issuesToClose) {
      await closeGithubIssue(issue.id)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

function listAllSourceFiles(
  directoryPath: string,
  fileExtension: string = '.ts'
): string[] {
  let filesInDirectory: string[] = []

  try {
    const files = fs.readdirSync(directoryPath)

    files.forEach(file => {
      const fullPath = path.join(directoryPath, file)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        filesInDirectory = filesInDirectory.concat(
          listAllSourceFiles(fullPath, fileExtension)
        )
      } else if (path.extname(file) === fileExtension) {
        filesInDirectory.push(fullPath)
      }
    })
  } catch (error) {
    console.error('Error listing source files:', error)
    throw error
  }

  return filesInDirectory
}
