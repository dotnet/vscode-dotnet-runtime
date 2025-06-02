/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IEventStream } from "../EventStream/EventStream";
import { DotnetVSCodeExtensionChange, DotnetVSCodeExtensionFound, DotnetVSCodeExtensionHasInstallRequest } from "../EventStream/EventStreamEvents";
import { IDotnetAcquireContext } from "../IDotnetAcquireContext";
import { IVSCodeExtensionContext } from "../IVSCodeExtensionContext";
import { IJsonInstaller } from "./IJsonInstaller";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export class JsonInstaller extends IJsonInstaller
{
    private readonly knownCommonExtensionIdsNotUsingDotnet: Set<string> = new Set<string>([
        'vscode.bat',
        'vscode.clojure',
        'vscode.coffeescript',
        'vscode.configuration-editing',
        'vscode.cpp',
        'vscode.css',
        'vscode.css-language-features',
        'vscode.dart',
        'vscode.debug-auto-launch',
        'vscode.debug-server-ready',
        'vscode.diff',
        'vscode.docker',
        'vscode.emmet',
        'vscode.extension-editing',
        'vscode.fsharp',
        'vscode.git',
        'vscode.git-base',
        'vscode.github',
        'vscode.github-authentication',
        'vscode.go',
        'vscode.groovy',
        'vscode.grunt',
        'vscode.gulp',
        'vscode.handlebars',
        'vscode.hlsl',
        'vscode.html',
        'vscode.html-language-features',
        'vscode.ini',
        'vscode.ipynb',
        'vscode.jake',
        'vscode.java',
        'vscode.javascript',
        'vscode.json',
        'vscode.json-language-features',
        'vscode.julia',
        'vscode.latex',
        'vscode.less',
        'vscode.log',
        'vscode.lua',
        'vscode.make',
        'vscode.markdown',
        'vscode.markdown-language-features',
        'vscode.markdown-math',
        'vscode.media-preview',
        'vscode.merge-conflict',
        'vscode.microsoft-authentication',
        'ms-vscode.js-debug',
        'ms-vscode.js-debug-companion',
        'ms-vscode.vscode-js-profile-table',
        'vscode.builtin-notebook-renderers',
        'vscode.npm',
        'vscode.objective-c',
        'vscode.perl',
        'vscode.php',
        'vscode.php-language-features',
        'vscode.powershell',
        'vscode.pug',
        'vscode.python',
        'vscode.r',
        'vscode.razor',
        'vscode.references-view',
        'vscode.restructuredtext',
        'vscode.ruby',
        'vscode.rust',
        'vscode.scss',
        'vscode.search-result',
        'vscode.shaderlab',
        'vscode.shellscript',
        'vscode.simple-browser',
        'vscode.sql',
        'vscode.swift',
        'vscode.terminal-suggest',
        'vscode.theme-abyss',
        'vscode.theme-defaults',
        'vscode.theme-kimbie-dark',
        'vscode.theme-monokai',
        'vscode.theme-monokai-dimmed',
        'vscode.theme-quietlight',
        'vscode.theme-red',
        'vscode.vscode-theme-seti',
        'vscode.theme-solarized-dark',
        'vscode.theme-solarized-light',
        'vscode.theme-tomorrow-night-blue',
        'vscode.tunnel-forwarding',
        'vscode.typescript',
        'vscode.typescript-language-features',
        'vscode.vb',
        'vscode.xml',
        'vscode.yaml',
        'GitHub.copilot',
        'GitHub.copilot-chat',
        'GitHub.vscode-pull-request-github',
        'ms-vscode-remote.remote-wsl',
        'ms-vscode.hexeditor',
        'ms-vscode.powershell',
        'ms-vscode.vscode-typescript-next',
        'ms-python.python',
        'ms-python.vscode-pylance',
        'ms-toolsai.jupyter',
        'ms-toolsai.jupyter-renderers',
        'ms-toolsai.jupyter-keymap',
        'ms-toolsai.jupyter-cell-tags',
        'ms-vscode.cpptools',
        'ms-vscode.cpptools-extension-pack',
        'ms-python.debugpy',
        'VisualStudioExptTeam.vscodeintellicode',
        'VisualStudioExptTeam.vscodeintellicode-api',
        'VisualStudioExptTeam.vscodeintellicode-azureapi',
        'VisualStudioExptTeam.vscodeintellicode-azureapi-preview',
        'redhat.java',
        'redhat.vscode-yaml',
        'ms-azuretools.vscode-docker',
        'ms-azuretools.vscode-azureresourcegroups',
        'ms-azuretools.vscode-azureresourcegroups-explorer',
        'ms-vscode-remote.remote-wsl',
        'ms-vscode-remote.remote-containers',
        'ms-vscode-remote.remote-ssh',
        'ms-vscode-remote.remote-ssh-edit',
        'ms-vscode-remote.remote-ssh-explorer',
        'ms-vscode-remote.remote-tunnels',
        'ms-vscode-remote.remote-wsl-edit',
        'GitHub.vscode-pull-request-github',
    ]);

    constructor(protected readonly eventStream: IEventStream, protected readonly vscodeAccessor: IVSCodeExtensionContext)
    {
        super(eventStream, vscodeAccessor);
        // If a new extension is installed, we want to install .NET preemptively for it if specified
        vscodeAccessor.registerOnExtensionChange(() =>
        {
            this.eventStream.post(new DotnetVSCodeExtensionChange(`A change was detected in the extensions. Installing .NET for new extensions.`));
            this.executeJSONRequests().catch(() => {});
        })

        // On startup, (our extension gets activated onStartupFinished() via 'activationEvents' in package.json) we want to install .NET preemptively
        // So other extensions can have a faster startup time if they so desire
        this.executeJSONRequests().catch(() => {});
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async executeJSONRequests(): Promise<void>
    {
        const extensions = this.vscodeAccessor.getExtensions().filter((extension) => !this.knownCommonExtensionIdsNotUsingDotnet.has(extension.id));
        for (const extension of extensions)
        {
            const extensionPackage = extension?.packageJSON;
            this.eventStream.post(new DotnetVSCodeExtensionFound(`Checking extension ${extension?.id} for .NET installation requests`));

            if (extensionPackage?.['x-dotnet-acquire'])
            {
                this.eventStream.post(new DotnetVSCodeExtensionHasInstallRequest(`Installing .NET for extension ${extension.id}`));
                const jsonRequest = (extensionPackage as { "x-dotnet-acquire": Omit<IDotnetAcquireContext, "requestingExtensionId"> })["x-dotnet-acquire"];
                const apiRequest: IDotnetAcquireContext = { ...jsonRequest, requestingExtensionId: extension.id };
                this.vscodeAccessor.executeCommand('dotnet.acquire', apiRequest);
            }

        }
    }
}
