# Troubleshooting Issues with .NET SDK Install Tool

## Unable to add to PATH

To manually configure the `PATH`, see instructions by OS below. If you are still unable to add to the PATH environment variable you can still use the SDK by specifying the entire path to the executable. That is, instead of simply typing `dotnet` on the command line you can specify the full path that is outputted upon install.

Please note that system environment variables may not take effect until after machine restart. If you believe setting the `PATH` was successful but the `dotnet` command is still not recognized on the command line, please restart your computer and try again.

### Windows

To manually set the PATH, open the control panel and go to `Edit the system environment variables`. Select the `Advanced` tab, the `Environment Variables...` button, and find the `Path` variable in the list of user variables. Select `Edit`, `New`, and paste the path to the directory containing the dotnet executable, for example `C:\Users\user\AppData\Roaming\.dotnet\version`.

### Mac and Linux

To manually set the PATH, edit your `.bash_profile` file to include the following line with  `{ .NET Path }` replaced by the path to the directory containing the dotnet executable.

```
 PATH=$PATH:{ .NET Path }
```

## Install Script Timeouts

Please note that, depending on your network speed, installing the .NET SDK might take some time. By default, the installation terminates unsuccessfully if it takes longer than 10 minutes to finish. If you believe this is too little (or too much) time to allow for the download, you can change the timeout value by setting `dotnetSDKAcquisitionExtension.installTimeoutValue` to a custom value.

Learn more about configuring Visual Studio Code settings [here](https://code.visualstudio.com/docs/getstarted/settings) and see below for an example of a custom timeout in a `settings.json` file. In this example the custom timeout value is 300 seconds, or 5 minutes.

```json
{
    "dotnetSDKAcquisitionExtension.installTimeoutValue": 300
}
```

## Other Issues

Haven't found a solution? Check out our [open issues](https://github.com/dotnet/vscode-dotnet-runtime/issues). If you don't see your issue there, please file a new issue by evoking the `.NET SDK Install Tool: Report an issue with the .NET SDK Install Tool` command from Visual Studio Code.
