Contributing to the VSCode .NET Core Acquisition Extension
=========================

The .NET Core team maintains guidelines for contributing to the .NET Core repos. A .NET Core team member will be happy to explain why a guideline is defined as it is.

General contribution guidance is included in this document. Additional guidance is defined in the documents linked below.

- [Copyright](copyright.md) describes the licensing practices for the project.
- [Contribution Workflow](contributing-workflow.md) describes the workflow that the team uses for considering and accepting changes.

Up for Grabs
------------

The team marks the most straightforward issues as "up for grabs". This set of issues is the place to start if you are interested in contributing but new to the codebase.

- [dotnet/vscode-vscode-dotnet-runtime-extension - "up for grabs"](https://github.com/dotnet/vscode-dotnet-runtime/labels/up-for-grabs)

Contribution "Bar"
------------------

Project maintainers will merge changes that improve the product significantly and broadly and that align with the [.NET Core roadmap](https://github.com/dotnet/core/blob/main/roadmap.md).

Maintainers will not merge changes that have narrowly-defined benefits, due to compatibility risk. The .NET Core codebase is used by several Microsoft products (for example, ASP.NET Core, .NET Framework 4.x, Windows Universal Apps) to enable execution of managed code. Other companies are building products on top of .NET Core, too. We may revert changes if they are found to be breaking.

Contributions must also satisfy the other published guidelines defined in this document.

Automated Code Review Assistance
------------------

CROSS is a tool developed by Microsoft that is used to highlight areas of higher risk in a code change in order to help code reviewers do a more effective job.

DOs and DON'Ts
--------------

Please do:

- **DO** follow our [coding style](https://github.com/dotnet/corefx/blob/main/Documentation/coding-guidelines/coding-style.md) (C# code-specific)
- **DO** give priority to the current style of the project or file you're changing even if it diverges from the general guidelines.
- **DO** include tests when adding new features. When fixing bugs, start with
  adding a test that highlights how the current behavior is broken.
- **DO** keep the discussions focused. When a new or related topic comes up
  it's often better to create new issue than to side track the discussion.
- **DO** blog and tweet (or whatever) about your contributions, frequently!

Please do not:

- **DON'T** make PRs for style changes.
- **DON'T** surprise us with big pull requests. Instead, file an issue and start
  a discussion so we can agree on a direction before you invest a large amount
  of time.
- **DON'T** commit code that you didn't write. If you find code that you think is a good fit to add to .NET Core, file an issue and start a discussion before proceeding.
- **DON'T** submit PRs that alter licensing related files or headers. If you believe there's a problem with them, file an issue and we'll be happy to discuss it.
- **DON'T** add API additions without filing an issue and discussing with us first. See [API Review Process](https://github.com/dotnet/corefx/blob/main/Documentation/project-docs/api-review-process.md).

Managed Code Compatibility
--------------------------

Contributions must maintain [API signature](https://github.com/dotnet/corefx/blob/main/Documentation/coding-guidelines/breaking-changes.md#bucket-1-public-contract) and behavioral compatibility. Contributions that include [breaking changes](https://github.com/dotnet/corefx/blob/main/Documentation/coding-guidelines/breaking-changes.md) will be rejected. Please file an issue to discuss your idea or change if you believe that it may affect managed code compatibility.

Commit Messages
---------------

Please format commit messages as follows (based on [A Note About Git Commit Messages](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html)):

```
Summarize change in 50 characters or less

Provide more detail after the first line. Leave one blank line below the
summary and wrap all lines at 72 characters or less.

If the change fixes an issue, leave another blank line after the final
paragraph and indicate which issue is fixed in the specific format
below.

Fix #42
```

Also do your best to factor commits appropriately, not too large with unrelated things in the same commit, and not too small with the same small change applied N times in N different commits.

Contributor License Agreement
-----------------------------

You must sign a [.NET Foundation Contribution License Agreement (CLA)](https://cla.dotnetfoundation.org) before your PR will be merged. This is a one-time requirement for projects in the .NET Foundation. You can read more about [Contribution License Agreements (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) on Wikipedia.

The agreement: [net-foundation-contribution-license-agreement.pdf](https://github.com/dotnet/home/blob/main/guidance/net-foundation-contribution-license-agreement.pdf)

You don't have to do this up-front. You can simply clone, fork, and submit your pull-request as usual. When your pull-request is created, it is classified by a CLA bot. If the change is trivial (for example, you just fixed a typo), then the PR is labelled with `cla-not-required`. Otherwise it's classified as `cla-required`. Once you signed a CLA, the current and all future pull-requests will be labelled as `cla-signed`.

File Headers
------------

The following file header is the used for .NET Core. Please use it for new files.

```
/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
```

- See [extension.ts](../vscode-dotnet-runtime-library/src/extension.ts) for an example of the header in a TypeScript file.

Copying Files from Other Projects
---------------------------------

.NET Core uses some files from other projects, typically where a binary distribution does not exist or would be inconvenient.

The following rules must be followed for PRs that include files from another project:

- The license of the file is [permissive](https://en.wikipedia.org/wiki/Permissive_free_software_licence).
- The license of the file is left in-tact.
- The contribution is correctly attributed in the [3rd party notices](../THIRD-PARTY-NOTICES.txt) file in the repository, as needed.
