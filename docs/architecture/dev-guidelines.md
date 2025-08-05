# Development Guidelines
This doc will break down best practices for developing within this repo for Clera.
> Ship Early and Ship Often

NOTE: I haven't completed configuring Github Actions. So before running any CI/CD stuff, I need to:
1. Configure GitHub Repository Settings:
    * Create staging and production environments with required approvers
    * Set branch protection rules for main
2. Set Up GitHub Secrets:
    * Add all necessary API keys and credentials as GitHub Secrets
    * For example: OPENAI_API_KEY, VERCEL_TOKEN, SNYK_TOKEN, etc.
3. Complete Deployment Configurations:
    * Update the deployment steps with your specific deployment commands
    * Configure any cloud provider credentials needed for deployment
4. Create Initial Workflows Run:
    * Trigger the first run manually using the "workflow_dispatch" event
    * Review logs and fix any initial configuration issues

## GitHub Flow Overview
We've adopted GitHub Flow, a lightweight, branch-based workflow that supports teams that need to move quickly. This is ideal for our small team of 3 developers working on a fintech AI startup where we need to iterate rapidly.

The core principles of GitHub Flow are:
1. The `main` branch is always deployable
2. All changes are made through feature branches
3. Pull requests initiate discussion about changes
4. Changes are deployed immediately after merge to `main`

## Navigating Git Branches and Timeline
To quickly see a snapshot of where you are in the version history, run:
* `git log --all --graph --decorate`
* or `git log --all --graph --decorate --oneline` to see a simplified version

To move to a different branch, use `git checkout <name>` such as `git checkout main` to point `HEAD` to `main`.

## Working with GitHub Flow

### Creating a Branch
Always create branches from the `main` branch:

```bash
# Ensure you're on main and it's up to date
git checkout main
git pull

# Create a new branch
git checkout -b <type/short-description>
```

### Making Changes
Make your changes in your branch, committing often:

```bash
git add .
git commit -m "<description>"
```

### Pushing and Creating a Pull Request
Push your branch and create a pull request as early as possible to start getting feedback:

```bash
git push -u origin <type/short-description>
```

Then create a pull request through the GitHub interface.

### Discussing and Reviewing Code
Use the pull request for discussion and code review. Address feedback with additional commits to your branch.

### Deploying and Merging
Once approved, merge your pull request into `main`:

```bash
# This is typically done through GitHub's interface
# But can also be done via command line:
git checkout main
git pull
git merge <type/short-description>
git push origin main
```

After merging, deploy the changes to production. With GitHub Flow, we aim to deploy to production as soon as changes are merged to `main`.

### Cleaning Up
After your branch is merged, delete it:

```bash
git branch -d <type/short-description>  # local deletion
git push origin --delete <type/short-description> # remote deletion
```

## Branch Naming Convention

Format we will use is to name branches: `type/short-description`
* `type` should be one of:
    * `feature` - New features or enhancements
    * `fix` - Bug fixes
    * `hotfix` - Critical fixes that need immediate deployment
    * `docs` - Documentation updates
    * `refactor` - Code changes that neither fix a bug nor add a feature
    * `test` - Adding or modifying tests

### Examples
- `feature/user-authentication`
- `fix/login-error`
- `hotfix/security-vulnerability`
- `docs/api-documentation`
- `refactor/payment-processing`
- `test/user-registration`

### Branch Naming Best Practices

1. Use lowercase letters, numbers, and hyphens for the description
2. Keep descriptions concise but descriptive (3-5 words)
3. Include ticket/issue IDs when applicable (e.g., `feature/CLERA-123-user-auth`)
4. Avoid using underscores or spaces
5. Use forward slashes to separate the branch type from the description

## Commit Message Guidelines

1. Use the imperative mood ("Add feature" not "Added feature")
2. First line should be 50 characters or less
3. Include the issue ID at the beginning when applicable
4. For complex changes, include a more detailed explanation after the first line, separated by a blank line
5. Example: `[CLERA-123] Add user authentication feature`

## CI/CD Pipeline with GitHub Actions

Our CI/CD pipeline is implemented with GitHub Actions. The pipelines automatically build, test, and deploy our code when changes are pushed to the repository.

### Pipeline Overview

We have three main GitHub Actions workflows:

1. **Backend CI/CD** (`.github/workflows/backend-ci-cd.yml`)
   - Runs security scans, linting, and tests for Python code
   - Builds and tests Docker containers
   - Deploys to staging automatically and to production after manual approval

2. **Frontend CI/CD** (`.github/workflows/frontend-ci-cd.yml`)
   - Runs security scans, linting, and tests for Next.js code
   - Builds the frontend application
   - Deploys to staging automatically and to production after manual approval

3. **Security Scans** (`.github/workflows/security-checks.yml`)
   - Runs on a weekly schedule
   - Performs comprehensive secret scanning
   - Conducts dependency vulnerability analysis
   - Uses CodeQL for static analysis

### Environment Deployment Strategy

- **Staging**: Automatic deployment when code is merged to the `main` branch
- **Production**: Manual approval required after staging deployment is complete and verified

### Working with the CI/CD Pipeline

1. **Pull Request Checks**
   - When you create a pull request, the CI pipeline automatically runs tests and security checks
   - Address any issues found by the pipeline before merging

2. **Secrets Management**
   - Never commit sensitive information (API keys, tokens, credentials) to the repository
   - Use GitHub Secrets to store sensitive data
   - Reference secrets in workflows using the `${{ secrets.SECRET_NAME }}` syntax

3. **Viewing Workflow Results**
   - Check the "Actions" tab in the GitHub repository to view workflow runs
   - Click on a specific run to see detailed logs and results

4. **Deployment Approvals**
   - Production deployments require manual approval
   - Approvers should verify the application in staging before approving production deployment

## Code Review Process

1. All code changes must be submitted via pull requests
2. Pull requests require at least one approval before merging
3. The author should not approve their own pull request
4. Code reviewers should check for:
   - Functionality: Does the code work as intended?
   - Code quality: Is the code clean, maintainable, and following our standards?
   - Test coverage: Are there appropriate tests?
   - Documentation: Is the code properly documented?

## Continuous Integration and Deployment

1. CI runs automatically on all pull requests
2. All tests must pass before merging to `main`
3. Once merged to `main`, changes are automatically deployed to staging
4. After verification in staging, changes are promoted to production (this can be automated or manual depending on our risk tolerance)

## Testing Requirements

1. All new features must include appropriate unit tests
2. Bug fixes should include tests that verify the fix
3. Maintain a minimum test coverage of 80% for new code
4. Run the full test suite locally before submitting a pull request

## Handling Production Issues

For critical issues that need immediate attention:

1. Create a `hotfix` branch directly from `main`
2. Make the fix and create a pull request
3. After review, merge directly to `main`
4. Deploy immediately to production

## Security Best Practices

As a fintech AI startup handling sensitive user data, we must adhere to these security practices:

1. **Secret Management**
   - Never hardcode secrets or credentials in the codebase
   - Use GitHub Secrets for all sensitive values
   - Regularly rotate API keys and credentials
   
2. **Code Security**
   - Pay attention to security scanning results in the CI pipeline
   - Fix all identified security vulnerabilities before merging to `main`
   - Use secure coding practices to prevent common vulnerabilities

3. **Dependency Management**
   - Regularly update dependencies to patch security vulnerabilities
   - Review dependency changes carefully when updating packages
   - Monitor security advisories for the libraries we use

4. **Data Protection**
   - Always encrypt sensitive user data
   - Minimize access to production data
   - Implement proper authorization and authentication mechanisms

## Additional Resources

- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)

## Testing
We will use:
* pytest (Python)
* Jest/Playwright (JavaScript frontend)
* automated security checks (e.g., Dependabot)