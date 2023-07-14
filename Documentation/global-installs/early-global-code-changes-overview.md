! This PR Description is a copy of the document made in `\Documentation\global-installs\early-global-code-changes-overview.md`)

# .NET Global Acquisition Engineering Spec

Resolves: https://github.com/dotnet/vscode-dotnet-runtime/issues/763.

Described below is an overview of the changes made to enable supporting global .NET SDK installs via our VS Code Extensions. This document's original function was to help during PR Review, as this functionality was added in 1-go. (This is terrible and I am sorry: but we had initially struggled to get reviewers during development and were trying to move swiftly.)

# Extension Plan

We have added functionality to the .NET SDK Extension to install the SDK Globally. That extension will also be able to install the .NET Runtime globally for use by the .NET SDK.

> :apple: The .NET Education Bundle APIs will be unaffected as we have just added a global option, however the extension will be re-branded to remove the remarks of 'do NOT use,' as well as the 'education bundle' marketing.

The API will change to installing the SDK globally by default in the future. (Because we do not want people to rely on the local SDK install feature in production, as it was intended only for the education bundle.) We are waiting for the education bundle to be prepared for that breaking change.

In the initial set of changes, the branding is not included. The changes to extension documentation, names, etc, will go in a separate PR.

# Overview of How Global Installs are Done

> :exclamation: For Windows and Mac, we can leverage the .NET Installer that we ship. We can determine the correct installer and simply download and then execute it.

For Windows, if we are already running VS Code with admin, we can simply download and run the installer in quiet mode and the user will not see anything.

![image](https://github.com/dotnet/vscode-dotnet-runtime/assets/23152278/fba4223a-140c-40d5-b17e-94ce0b25a952)


In any other case on windows, and always on mac, we can make the .NET Installer appear above VS Code. That will handle any elevation/UAC prompts for us. It also will handle conflicting SDKs that could be on the machine, setup issues with currently running versions of dotnet, etc, and provides a consistent already-built user experience. We have greatly simplified our job by just downloading the correct installer file from your machine using data available from our releases APIs, and then executing said installer.

> :fire: For Linux we essentially had to write our own installer. We have a separate linux document, `[here](linux-global-install-design.md)` which I would suggest checking out.

The TLDR is the following: It uses the distro package manager to install the dotnet package on the system using commands such as `apt-get`. It will use the dotnet packages provided by the distro if it's version includes such packages, otherwise it will attempt to use the Microsoft feed packages.

Our initial push includes Ubuntu. We intend add RHEL and other supported linux versions within VS Code before launch. We also have a policy in place for the community to add support to other distros described in the linux document. :star: In the intial set of changes, only Ubuntu is supported.

A threat model must be developed. It will not be part of the initial PR.

# Changes Made

For those reviewing the code changes, it may be best to look at the isolated files and their tests so the review can be broken up into chunks. The changes should also be investigated from an end-to-end perspective. However, the changes are minimal and copy existing patterns, with a global flag that branches to its own logic. Here are the working pieces that were added/changed:

### Review Suggestions

The code should be under the most scrutiny. We will have PMs review the error messages. For decisions such as, 'WSL is not supported,' or, 'We support XYZ Distros,' or 'We do/don't allow this install,' every decision has been vetted by 3-5+ PMs, so while questioning these decisions may be of use, it is not something a reviewer needs to focus on.

## Version Resolver

The version resolver now has functionality to extract the feature band, patch version, major, minor, and more from modern .NET Core Versions. We don't expect this will be used to install older .NET versions or plan to support that, so this is OK.

## Global Installer Resolver

As defined in the spec here https://github.com/dotnet/vscode-dotnet-runtime/issues/763, users can request the SDK using different version formats when making a global request.

This class uses the new VersionResolver functionality to determine what version the user should install (aka the newest version that matches what they requested.) It should find the correct installer file to download for windows and mac and save a link to that file for others to access.

## Linux Version Resolver

The Linux Version Resolver has a few purposes. One, it determines what distro and version you are running on, and creates the correct distro class for you. Currently there is no special distro logic in place since only Ubuntu is supported, however, we anticipate the factory function this class has will be expanded to support more distros that have unique requirements to do an installation.

This class is also responsible for calling the correct APIs to validate and ensure that the correct action is taken: aka, if we can update instead of installing, if we do not need to install because an install already exists, or if we cannot install, this class handles all of that logic.

## Linux Installer

The Linux Global Installer exists to provide high level visiblity into the install so code calling the installer can make decisions it needs to make about the install, and mostly so we can match the API that is used by the windows and mac installer.

## GenericDistroProvider

All of the distro specific logic has been extracted out of the linux version resolver and put into this class. It is essentially a 'front' into the distro.json file that contains all of the commands that need to be executed for a particular distro to do an install.

> :question: We use a json file for several reasons which is described in the linux document. It makes it easier to support more distros and accept community contributions by holding all of the functions that are specific to a distro one 1 file. It makes it so we can make minimal code changes and just read the json file for each distro instead of writing unique code for each distro. It also makes it easier to transition to using a live API service for distro version support details once that is created.

The Generic Distro Provider was written under Ubuntu, but it is also 'generic' in the sense that for most commands, it simply runs the command in the json file for the matching distro and version, so it is relatively platform-agnostic. Ubuntu does not require much special logic to capture the output of the commands or run the commands, and so it is extendable to other distros.

> :exclamation: This interface currently supports more than what's used and exposed by our commands. This code has been tested. For example, we add the ability to uninstall the SDK, however, we have yet to add a global uninstall command. We do not have strong demand for such an API yet. But as we want to accept community contributions, we wanted to future-proof this API so everything that we could possibly need has been implemented.

## Windows & Mac Installer

The Windows and Mac installer provides ability to download the install file correctly and execute it using the correct flags. It will also have sign-checking in the future.

## File Utilities

This class allows us to check if we are elevated and will host any file related operations needed for managing installs.

## Command Executor

This library runs a command you give it. For linux, it will handle the sudo elevation prompts that are needed to gain elevation.

For sudo elevation we rely on the built-in `@vscode/sudo` library which will show a prompt above the user like that is not super encouraging. We plan to make changes in their library to improve the UX.

<img width="423" alt="MicrosoftTeams-image (1)" src="https://github.com/dotnet/vscode-dotnet-runtime/assets/23152278/6a35ceb0-78a5-4f89-990d-d3ea4425447e">


One of the key purposes of this class is to make the global installs mockable and testable, as we don't want to leave global install artifacts on dev-box or pipeline machines. It also enables us to fake responses from the OS when running commands or installs.