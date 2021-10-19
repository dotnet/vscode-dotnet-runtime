# Troubleshooting Issues with .NET Install Tool for Extension Authors

## Install Script Timeouts

Please note that, depending on your network speed, installing the .NET Core runtime might take some time. By default, the installation terminates unsuccessfully if it takes longer than 2 minutes to finish. If you believe this is too little (or too much) time to allow for the download, you can change the timeout value by setting `dotnetAcquisitionExtension.installTimeoutValue` to a custom value.

Learn more about configuring Visual Studio Code settings [here](https://code.visualstudio.com/docs/getstarted/settings) and see below for an example of a custom timeout in a `settings.json` file. In this example the custom timeout value is 180 seconds, or 3 minutes.

```json
{
    "dotnetAcquisitionExtension.installTimeoutValue": 180
}
```

## Windows 7 Failures

The .NET Install Tool for Extension Authors requires TLS 1.2 to be enabled in order to install .NET. For more information on TLS1.2, see [the documentation](https://docs.microsoft.com/mem/configmgr/core/plan-design/security/enable-tls-1-2-client).

## Manually Installing .NET

If .NET installation is failing or you want to reuse an existing installation of .NET, you can use the `dotnetAcquisitionExtension.existingDotnetPath` setting. .NET can be manually installed from [the .NET website](https://aka.ms/dotnet-core-download). To direct this extension to that installation, update your settings with the extension ID and the path as illustrated below.

#### Windows

```json
    "dotnetAcquisitionExtension.existingDotnetPath": [
        {"extensionId": "msazurermtools.azurerm-vscode-tools", "path": "C:\\Program Files\\dotnet\\dotnet.exe"}
    ]
```

#### Mac
```json
    "dotnetAcquisitionExtension.existingDotnetPath": [
        {"extensionId": "msazurermtools.azurerm-vscode-tools", "path": "/usr/local/share/dotnet/dotnet"}
    ]
```

## Other Issues

Haven't found a solution? Check out our [open issues](https://github.com/dotnet/vscode-dotnet-runtime/issues). If you don't see your issue there, please file a new issue by evoking the `.NET Install Tool: Report an issue with the .NET Install Tool for Extension Authors` command from Visual Studio Code.
