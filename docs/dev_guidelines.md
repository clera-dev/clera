# Development Guidelines
This doc will break down best practices for developing within this repo for Clera.
> Branch Early and Branch Often

## Navigating Git Branches and Timeline
To quickly see a snapsot of where you are in the version history, run:
* `git log --al --graph --decorate`
* or `git log --al --graph --decorate --oneline` to see a simplified version

To move to a different branch, use `git checkout <name>` such as `git checkout main` to point `HEAD` to `main`.

To create a new branch, first ensure you are on the latest `develop` branch:
* `git checkout develop`
* `git pull` (`git fetch` and `git merge` in one command)

Then run:
* `git checkout -b <type/short-description>`

When you're ready to commit changes:
* `git add .`
* `git commit -m "<description>"`
Push feature branch to remote repository:
* `git push -u origin <type/short-description>`

Note: When your feature is complete, you would create a pull request to merge your feature branch back into the `develop` branch.

## Git Workflow and Branch Naming Convention

### Main Branches
- **`main`**: The primary branch containting production-ready code. This branch should always be deployable.
- **`develop`**: Integration branch for features before they go to production. All feature branches are merged here first.
 
## Branching
Be sure to branch for every problem you want to tackle within the code to ensure optimal development.
Format we will use is to name branches: `type/short-description`
* `type` must be either:
    * `feature`
    * `bugfix`
    * ``

### Branch Types

#### Feature Branches
- **Format**: `feature/[short-description]`
- **Example**: `feature/user-authentication` or `feature/01-user-authentication` for versioning
- **Purpose**: Used for developing new features or significant enhancements
- **Branched from**: `develop`
- **Merged back to**: `develop`

#### Bug Fix Branches
- **Format**: `bugfix/[short-description]`
- **Example**: `bugfix/ogin-error` or `bugfix/01-ogin-error`for versioning
- **Purpose**: Used for fixing non-critical bugs that can wait for the next regular release cycle
- **Branched from**: `develop`
- **Merged back to**: `develop`

#### Hotfix Branches
- **Format**: `hotfix/[short-description]`
- **Example**: `hotfix/security-vulnerability` or `hotfix/01-security-vulnerability` for versioning
- **Purpose**: Used for urgent fixes to production issues that cannot wait for the next release
- **Branched from**: `main`
- **Merged back to**: Both `main` AND `develop`

#### Release Branches
- **Format**: `release/[version]`
- **Example**: `release/1.2.0`
- **Purpose**: Preparation for a new production release, allowing for minor bug fixes and release-specific tasks
- **Branched from**: `develop`
- **Merged back to**: Both `main` AND `develop`

#### Documentation Branches
- **Format**: `docs/[short-description]`
- **Example**: `docs/api-documentation`
- **Purpose**: Used for documentation-only changes
- **Branched from**: `develop`
- **Merged back to**: `develop`

#### Refactoring Branches
- **Format**: `refactor/[short-description]`
- **Example**: `refactor/optimize-database-queries` or `refactor/01-optimize-database-queries` for versioning
- **Purpose**: Used for code improvements that don't add features or fix bugs (performance improvements, code cleanup, etc.)
- **Branched from**: `develop`
- **Merged back to**: `develop`

### Key Differences Between Branch Types

**Bug Fix vs. Hotfix vs. Refactoring**:

- **Bug Fix Branches** are for non-urgent issues discovered during development or reported by users that can be addressed in the normal release cycle. These fixes are integrated into the `develop` branch and will be included in the next planned release.

- **Hotfix Branches** are for critical issues in the production environment that need immediate attention and cannot wait for the next regular release. These are branched directly from `main`/`master` (the production code), fixed, and then merged back to both `main`/`master` (for immediate deployment) and `develop` (to ensure the fix is included in future releases).

- **Refactoring Branches** are specifically for improving code quality, performance, or maintainability without changing functionality. Unlike bug fixes which address incorrect behavior, refactoring improves the implementation while preserving the existing behavior. Examples include optimizing algorithms, restructuring code, or improving naming conventions.

### Branch Naming Best Practices

1. Use lowercase letters, numbers, and hyphens for the description
2. Keep descriptions concise but descriptive (3-5 words)
3. Always include ticket/issue IDs when applicable
4. Avoid using underscores or spaces
5. Use forward slashes to separate the branch type from the description

## Commit Message Guidelines

1. Use the imperative mood ("Add feature" not "Added feature")
2. First line should be 50 characters or less
3. Include the issue ID at the beginning when applicable
4. For complex changes, include a more detailed explanation after the first line, separated by a blank line
5. Example: `[CLERA-123] Add user authentication feature`

## Code Review Process (to be enforced with larger team)

1. All code changes must be submitted via pull requests
2. Pull requests require at least one approval before merging
3. The author should not approve their own pull request
4. Code reviewers should check for:
   - Functionality: Does the code work as intended?
   - Code quality: Is the code clean, maintainable, and following our standards?
   - Test coverage: Are there appropriate tests?
   - Documentation: Is the code properly documented?

## Testing Requirements

1. All new features must include appropriate unit tests
2. Bug fixes should include tests that verify the fix
3. Maintain a minimum test coverage of 80% for new code
4. Run the full test suite locally before submitting a pull request

## Deployment Process

1. Releases are created from the `main` branch
2. Version numbers follow Semantic Versioning (MAJOR.MINOR.PATCH)
3. Each release should be tagged in Git with the version number
4. Deployment to production requires approval from the project lead

## Additional Resources

- [Git Flow Documentation](https://nvie.com/posts/a-successful-git-branching-model/)
- [Semantic Versioning](https://semver.org/)