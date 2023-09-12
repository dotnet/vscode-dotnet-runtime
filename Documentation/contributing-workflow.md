Contribution Workflow
=====================

You can contribute to .NET Core with issues and PRs. Simply filing issues for problems you encounter is a great way to contribute. Contributing implementations is greatly appreciated.

## Suggested Workflow

We use and recommend the following workflow:

1. Create an issue for your work.
    - You can skip this step for trivial changes.
    - Reuse an existing issue on the topic, if there is one.
    - Use [CODE_OWNERS.TXT](../CODE_OWNERS.txt) to find relevant maintainers and @ mention them to ask for feedback on your issue.
    - Get agreement from the team and the community that your proposed change is a good one.
    - If your change adds a new API, follow the [API Review Process](https://github.com/dotnet/corefx/blob/main/Documentation/project-docs/api-review-process.md) (but replace CoreFX with this repo).
    - Clearly state that you are going to take on implementing it, if that's the case. You can request that the issue be assigned to you. Note: The issue filer and the implementer don't have to be the same person.
2. Create a personal fork of the repository on GitHub (if you don't already have one).
3. Create a branch off of main (`git checkout -b mybranch`).
    - Name the branch so that it clearly communicates your intentions, such as issue-123 or githubhandle-issue.
    - Branches are useful since they isolate your changes from incoming changes from upstream. They also enable you to create multiple PRs from the same fork.
4. Make and commit your changes.
    - Please follow our [Commit Messages](contributing.md#commit-messages) guidance.
5. Add new tests corresponding to your change, if applicable.

If you are having difficulty debugging changes to the library, you may want to incorporate the logging messages into your test session. To do so, set the debugOn flag to true [Here](../vscode-dotnet-runtime-library/src/Utils/Debugging.ts).
Note that the runtime and sdk extensions can be tested (with breakpoints as well, through the .js files) using their corresponding workspace and launch profiles by opening their root folders in vscode.
For the library, those tests are reachable by going through the runtime extension workspace and adding the runtime-library folder to the workspace. But logging may be a better approach to debug this code.


If you are having difficulty debugging all other changes, note that you can add breakpoints into the tests for the library, runtime, or SDK by opening their corresponding workspace folder and launching the debug tab for their tests in VS Code. If you want to breakpoint the code, you'll need to breakpoint the test in typescript, but then every reload add breakpoints to the JS code generated from the typescript code if you want to debug code outside of the tests thesmelves that the tests run.

6. Build the repository with your changes.
    - Make sure that the builds are clean.
    - Make sure that the tests are all passing, including your new tests.
    - Try running the sample extension to test the extensions manually. The sample extension exposes the extensions' commands that are not normally user facing to allow developers to test end to end.
    - If you made any changes to the extensions' command API surface, make sure to update the sample extension to account for these changes.
7. Create a pull request (PR) against the upstream repository's **main** branch.
    - Push your changes to your fork on GitHub (if you haven't already).

Note: It is OK for your PR to include a large number of commits. Once your change is accepted, you will be asked to squash your commits into one or some appropriately small number of commits before your PR is merged.

Note: It is OK to create your PR as "[WIP]" on the upstream repo before the implementation is done. This can be useful if you'd like to start the feedback process concurrent with your implementation. State that this is the case in the initial PR comment.

## Building and Testing Locally

Before making a pull request, be sure to build and test your changes locally with the build script ([windows](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/build.cmd), [mac](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/build.sh)) and test script ([windows](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/test.cmd), [mac](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/test.sh)). To lint your changes, run the test script with the parameter `--tslint`

You can also test only a specific set of tests using the following parameters with the test script:
Test SDK Extension Only: `test sdk` (Tests the SDK extension only.)
Test SDK Extension Only: `test rnt` (Tests the runtime extension only.)
Test SDK Extension Only: `test lib` (Tests the library only.)

## Building a .VSIX

To build an installable .vsix file locally, navigate to the directory containing the extension's package.json (either `vscode-dotnet-runtime-extension` or `vscode-dotnet-sdk-extension`) run the following commands:

```
npm install -g vsce
vsce package --ignoreFile ../.vscodeignore --yarn
```

## PR - CI Process

The [dotnet continuous integration](https://dev.azure.com/dnceng/public/) (CI) system will automatically perform the required builds and run tests (including the ones you are expected to run) for PRs. Builds and test runs must be clean.

If the CI build fails for any reason, the PR issue will be updated with a link that can be used to determine the cause of the failure.

## PR Feedback

Microsoft team and community members will provide feedback on your change. Community feedback is highly valued. You will often see the absence of team feedback if the community has already provided good review feedback.

1 or more Microsoft team members will review every PR prior to merge. They will often reply with "LGTM, modulo comments". That means that the PR will be merged once the feedback is resolved. "LGTM" == "looks good to me".

There are lots of thoughts and [approaches](https://github.com/antlr/antlr4-cpp/blob/main/CONTRIBUTING.md#emoji) for how to efficiently discuss changes. It is best to be clear and explicit with your feedback. Please be patient with people who might not understand the finer details about your approach to feedback.

# Merging Pull Requests (for contributors with write access)

Use ["Squash and Merge"](https://github.com/blog/2141-squash-your-commits) by default for individual contributions unless requested by the PR author.
  Do so, even if the PR contains only one commit. It creates a simpler history than "Create a Merge Commit".
  Reasons that PR authors may request "Merge and Commit" may include (but are not limited to):

  - The change is easier to understand as a series of focused commits. Each commit in the series must be buildable so as not to break `git bisect`.
  - Contributor is using an e-mail address other than the primary GitHub address and wants that preserved in the history. Contributor must be willing to squash
    the commits manually before acceptance.

