import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as Buffer from 'buffer';

interface Comment {
  type: string;
  content: string;
  file: string;
  line: number;
  message: string;
  key: string;
}

interface GitHubIssue {
  title: string;
  body: string;
  key?: string; // Assuming issues have a key to identify them, perhaps in the body or a label
}

/**
 * Read and return content of a file.
 */
async function readFileContent(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf8');
}

/**
 * Extracts comments from a file content based on given prefixes.
 */
function extractComments(fileContent: string, filePath: string, prefixes: string[]): Comment[] {
  const commentRegex = new RegExp('(' + prefixes.join('|') + '):\\s*(.*)', 'g');
  const lines = fileContent.split('\n');
  const comments: Comment[] = [];

  lines.forEach((line, index) => {
    let match;
    while ((match = commentRegex.exec(line)) !== null) {
      const contextStart = Math.max(index - 5, 0);
      const contextEnd = Math.min(index + 5, lines.length - 1);
      const context = lines.slice(contextStart, contextEnd + 1).join('\n');
      const key = Buffer.Buffer.from(`${filePath}:${index + 1}`).toString('base64');

      comments.push({ 
        type: match[1], 
        content: match[2], 
        file: filePath, 
        line: index + 1, 
        message: context,
        key: key
      });
    }
  });

  return comments;
}

/**
 * Generate issue title and description using ChatGPT
 */
async function generateIssueContent(comment: Comment): Promise<{ title: string; description: string }> {
  // Call ChatGPT API here to generate issue content
  // This is a placeholder implementation
  return {
    title: `${comment.type} in ${path.basename(comment.file)} at line ${comment.line}`,
    description: `Found a ${comment.type} comment:\n\n> ${comment.content}\n\nContext:\n${comment.message}\n\nThis issue was generated automatically from a source code comment. Key: ${comment.key}`
  };
}

/**
 * Fetch existing GitHub issues.
 */
async function fetchExistingIssues(): Promise<GitHubIssue[]> {
  // Fetch existing GitHub issues
  // This is a placeholder implementation
  return [];
}

/**
 * Create a GitHub issue
 */
async function createGitHubIssue(title: string, description: string) {
  // Call GitHub API to create an issue
  // This is a placeholder implementation
}

/**
 * Update a GitHub issue
 */
async function updateGitHubIssue(issueId: number, title: string, description: string) {
  // Call GitHub API to update an issue
  // This is a placeholder implementation
}

/**
 * The main function for the action.
 * @param {string[]} prefixes - Array of comment prefixes to look for.
 */
export async function run(prefixes: string[]): Promise<void> {
  try {
    const existingIssues = await fetchExistingIssues();
    const sourceFiles = await listAllSourceFiles(); // Assume this function lists all source files
    const foundComments: Comment[] = [];

    for (const file of sourceFiles) {
      const content = await readFileContent(file);
      const comments = extractComments(content, file, prefixes);
      foundComments.push(...comments);
    }

    // Process each found comment
    for (const comment of foundComments) {
      const { title, description } = await generateIssueContent(comment);
      const existingIssue = existingIssues.find(issue => issue.key === comment.key);

      if (existingIssue) {
        // Update existing issue
        await updateGitHubIssue(existingIssue.id, title, description);
      } else {
        // Create new issue
        await createGitHubIssue(title, description);
      }
    }

    // Check for issues to close (existing issues not found in current comments)
    const issuesToClose = existingIssues.filter(issue => !foundComments.some(comment => comment.key === issue.key));
    for (const issue of issuesToClose) {
      // Close the issue
      // Placeholder for closing an issue
    }

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

// Example usage with custom prefixes
run(['TODO:', 'FIXME:', 'BUG:', 'NOTE:']);
