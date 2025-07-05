/**
 * GitHub Integration Service for SepticSense Blog Publishing
 * Provides one-click publishing to GitHub Pages
 */
class GitHubService {
    constructor() {
        this.apiUrl = 'https://api.github.com';
        this.owner = null;
        this.repo = null;
        this.token = null;
        this.branch = 'main';
        this.isAuthenticated = false;
    }

    /**
     * Initialize GitHub service with configuration
     */
    async initialize(config) {
        this.owner = config.owner || localStorage.getItem('github_owner');
        this.repo = config.repo || localStorage.getItem('github_repo');
        this.token = config.token || localStorage.getItem('github_token');
        this.branch = config.branch || 'main';

        if (this.token && this.owner && this.repo) {
            this.isAuthenticated = await this.validateAuthentication();
        }

        return this.isAuthenticated;
    }

    /**
     * Authenticate with GitHub using personal access token
     */
    async authenticate(token, owner, repo) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;

        try {
            const response = await fetch(`${this.apiUrl}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                this.isAuthenticated = true;
                // Store credentials securely
                localStorage.setItem('github_token', token);
                localStorage.setItem('github_owner', owner);
                localStorage.setItem('github_repo', repo);
                return { success: true, user: await response.json() };
            } else {
                throw new Error('Invalid token or insufficient permissions');
            }
        } catch (error) {
            console.error('GitHub authentication failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate existing authentication
     */
    async validateAuthentication() {
        if (!this.token) return false;

        try {
            const response = await fetch(`${this.apiUrl}/repos/${this.owner}/${this.repo}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Authentication validation failed:', error);
            return false;
        }
    }

    /**
     * Create or update a blog post file in the repository
     */
    async publishBlogPost(postData) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with GitHub');
        }

        try {
            // Generate filename from title and date
            const filename = this.generateFilename(postData.title, postData.date);
            const path = `posts/${filename}`;

            // Convert post data to markdown format
            const content = this.formatPostContent(postData);
            const encodedContent = btoa(unescape(encodeURIComponent(content)));

            // Check if file already exists
            const existingFile = await this.getFileContent(path);
            
            const commitData = {
                message: `${existingFile ? 'Update' : 'Publish'} blog post: ${postData.title}`,
                content: encodedContent,
                branch: this.branch
            };

            if (existingFile) {
                commitData.sha = existingFile.sha;
            }

            const response = await fetch(`${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(commitData)
            });

            if (response.ok) {
                const result = await response.json();
                return {
                    success: true,
                    url: result.content.html_url,
                    sha: result.content.sha,
                    message: existingFile ? 'Blog post updated successfully' : 'Blog post published successfully'
                };
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to publish blog post');
            }
        } catch (error) {
            console.error('Blog post publishing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get existing file content from repository
     */
    async getFileContent(path) {
        try {
            const response = await fetch(`${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/${path}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Generate filename from post title and date
     */
    generateFilename(title, date) {
        const dateStr = new Date(date).toISOString().split('T')[0];
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return `${dateStr}-${slug}.md`;
    }

    /**
     * Format post data as markdown content
     */
    formatPostContent(postData) {
        const frontMatter = `---
title: "${postData.title}"
date: ${postData.date}
author: "${postData.author}"
category: "${postData.category}"
tags: [${postData.tags?.map(tag => `"${tag}"`).join(', ')}]
excerpt: "${postData.excerpt}"
featured: ${postData.featured || false}
published: true
---

`;

        return frontMatter + postData.content;
    }

    /**
     * Get repository status and recent commits
     */
    async getRepositoryStatus() {
        if (!this.isAuthenticated) return null;

        try {
            const [repoResponse, commitsResponse] = await Promise.all([
                fetch(`${this.apiUrl}/repos/${this.owner}/${this.repo}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }),
                fetch(`${this.apiUrl}/repos/${this.owner}/${this.repo}/commits?per_page=5`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                })
            ]);

            const repo = await repoResponse.json();
            const commits = await commitsResponse.json();

            return {
                name: repo.name,
                url: repo.html_url,
                lastPush: repo.pushed_at,
                recentCommits: commits.map(commit => ({
                    message: commit.commit.message,
                    date: commit.commit.author.date,
                    author: commit.commit.author.name,
                    sha: commit.sha.substring(0, 7)
                }))
            };
        } catch (error) {
            console.error('Failed to get repository status:', error);
            return null;
        }
    }

    /**
     * Disconnect GitHub integration
     */
    disconnect() {
        this.token = null;
        this.owner = null;
        this.repo = null;
        this.isAuthenticated = false;
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_owner');
        localStorage.removeItem('github_repo');
    }

    /**
     * Get authentication status
     */
    getAuthStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            owner: this.owner,
            repo: this.repo
        };
    }
}

// Create global instance
window.gitHubService = new GitHubService();

/**
 * Blog Post Publisher - Main interface for publishing posts
 */
class BlogPostPublisher {
    constructor() {
        this.isPublishing = false;
        this.publishQueue = [];
    }

    /**
     * Publish a blog post with progress tracking
     */
    async publishPost(postData, progressCallback) {
        if (this.isPublishing) {
            throw new Error('Another post is currently being published');
        }

        this.isPublishing = true;
        progressCallback?.({ stage: 'starting', message: 'Preparing to publish...' });

        try {
            // Validate post data
            this.validatePostData(postData);
            progressCallback?.({ stage: 'validating', message: 'Validating post data...' });

            // Check GitHub authentication
            if (!window.gitHubService.isAuthenticated) {
                throw new Error('GitHub integration not configured');
            }

            progressCallback?.({ stage: 'uploading', message: 'Publishing to GitHub...' });

            // Publish to GitHub
            const result = await window.gitHubService.publishBlogPost(postData);

            if (result.success) {
                progressCallback?.({ 
                    stage: 'success', 
                    message: result.message,
                    url: result.url 
                });
                
                // Update local storage with published status
                this.updatePostStatus(postData.id, 'published', result.url);
                
                return result;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            progressCallback?.({ 
                stage: 'error', 
                message: error.message 
            });
            throw error;
        } finally {
            this.isPublishing = false;
        }
    }

    /**
     * Validate post data before publishing
     */
    validatePostData(postData) {
        const required = ['title', 'content', 'author', 'category'];
        const missing = required.filter(field => !postData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        if (postData.title.length < 5) {
            throw new Error('Post title must be at least 5 characters long');
        }

        if (postData.content.length < 100) {
            throw new Error('Post content must be at least 100 characters long');
        }
    }

    /**
     * Update post status in local storage
     */
    updatePostStatus(postId, status, url = null) {
        const posts = JSON.parse(localStorage.getItem('blog_posts') || '[]');
        const postIndex = posts.findIndex(p => p.id === postId);
        
        if (postIndex !== -1) {
            posts[postIndex].status = status;
            posts[postIndex].publishedAt = new Date().toISOString();
            if (url) posts[postIndex].githubUrl = url;
            localStorage.setItem('blog_posts', JSON.stringify(posts));
        }
    }

    /**
     * Get publishing status
     */
    getPublishingStatus() {
        return {
            isPublishing: this.isPublishing,
            queueLength: this.publishQueue.length
        };
    }
}

// Create global publisher instance
window.blogPostPublisher = new BlogPostPublisher();

/**
 * UI Helper functions for GitHub integration
 */
window.GitHubUI = {
    /**
     * Show GitHub setup modal
     */
    showSetupModal() {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="github-setup-modal">
                <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                    <h3 class="text-xl font-heading font-bold text-text-primary mb-4">
                        Setup GitHub Integration
                    </h3>
                    <form id="github-setup-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-text-secondary mb-2">
                                Personal Access Token
                            </label>
                            <input type="password" id="github-token" required
                                class="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                placeholder="ghp_xxxxxxxxxxxx">
                            <p class="text-xs text-text-secondary mt-1">
                                <a href="https://github.com/settings/tokens" target="_blank" class="text-primary hover:underline">
                                    Create a token
                                </a> with 'repo' permissions
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-text-secondary mb-2">
                                Repository Owner
                            </label>
                            <input type="text" id="github-owner" required
                                class="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                placeholder="your-username">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-text-secondary mb-2">
                                Repository Name
                            </label>
                            <input type="text" id="github-repo" required
                                class="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                placeholder="your-blog-repo">
                        </div>
                        <div class="flex space-x-3 pt-4">
                            <button type="submit" class="flex-1 bg-primary hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                                Connect GitHub
                            </button>
                            <button type="button" onclick="this.closest('.fixed').remove()" 
                                class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle form submission
        document.getElementById('github-setup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            submitBtn.textContent = 'Connecting...';
            submitBtn.disabled = true;

            const token = document.getElementById('github-token').value;
            const owner = document.getElementById('github-owner').value;
            const repo = document.getElementById('github-repo').value;

            const result = await window.gitHubService.authenticate(token, owner, repo);
            
            if (result.success) {
                modal.remove();
                this.showSuccessMessage('GitHub integration setup successfully!');
                // Refresh the GitHub status UI
                this.updateGitHubStatus();
            } else {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                this.showErrorMessage(result.error);
            }
        });
    },

    /**
     * Update GitHub status in the UI
     */
    async updateGitHubStatus() {
        const statusElement = document.getElementById('github-status');
        if (!statusElement) return;

        const authStatus = window.gitHubService.getAuthStatus();
        
        if (authStatus.isAuthenticated) {
            const repoStatus = await window.gitHubService.getRepositoryStatus();
            statusElement.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <div class="w-3 h-3 bg-success rounded-full mr-2"></div>
                        <span class="text-sm text-text-secondary">Connected to ${authStatus.owner}/${authStatus.repo}</span>
                    </div>
                    <button onclick="GitHubUI.disconnect()" class="text-xs text-accent hover:underline">
                        Disconnect
                    </button>
                </div>
                ${repoStatus ? `
                    <div class="mt-2 text-xs text-text-secondary">
                        Last push: ${new Date(repoStatus.lastPush).toLocaleDateString()}
                    </div>
                ` : ''}
            `;
        } else {
            statusElement.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <div class="w-3 h-3 bg-warning rounded-full mr-2"></div>
                        <span class="text-sm text-text-secondary">GitHub not connected</span>
                    </div>
                    <button onclick="GitHubUI.showSetupModal()" class="text-xs text-primary hover:underline">
                        Setup
                    </button>
                </div>
            `;
        }
    },

    /**
     * Disconnect GitHub integration
     */
    disconnect() {
        window.gitHubService.disconnect();
        this.updateGitHubStatus();
        this.showSuccessMessage('GitHub integration disconnected');
    },

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        this.showNotification(message, 'success');
    },

    /**
     * Show error message
     */
    showErrorMessage(message) {
        this.showNotification(message, 'error');
    },

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-accent' : 'bg-primary';
        
        notification.innerHTML = `
            <div class="fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md">
                <div class="flex items-center justify-between">
                    <span>${message}</span>
                    <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
};

// Initialize GitHub service when the script loads
document.addEventListener('DOMContentLoaded', async () => {
    await window.gitHubService.initialize({});
    if (window.GitHubUI && typeof window.GitHubUI.updateGitHubStatus === 'function') {
        window.GitHubUI.updateGitHubStatus();
    }
});