#!/usr/bin/env bash
#
# Copyright © Microsoft Corporation
# All rights reserved.
#
# Licensed under the MIT License. See LICENSE-CODE in the project root for details.
#
# Exit codes:
# 0 - Success
# 1 - Unexpected failure
# 3 - Do not have permissions to run command
# 4 - Distribution not supported by script
#
# $1 - Distro to install
# $2 - String of additional dependencies to install
# $3 - Set to true to skip .NET Core dependency install entirely.
#      Useful for secondary libraries and non-.NET Core scenarios.
# $4 - More info URL

DISTRO=$1
ADDITIONAL_DEPS=$2
if [ "$3" = "true" ]; then SKIPDOTNETCORE=1; else SKIPDOTNETCORE=0; fi
MORE_INFO=$4

BASEDIR=$(dirname "$0")

# Utility function for exiting
exitScript()
{
    echo -e "\nPress enter to dismiss this message"
    read
    exit $1
}

# Wrapper function to only use sudo if not already root
sudoIf()
{
    if [ "$(id -u)" -ne 0 ]; then
        sudo $1 $2
    else
        $1 $2
    fi
}

# Utility function that waits for any existing installation operations to complete
# on Debian/Ubuntu based distributions and then calls apt-get
aptSudoIf() 
{
    while sudoIf fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
        echo -ne "(*) Waiting for other package operations to complete.\r"
        sleep 0.2
        echo -ne "(*) Waiting for other package operations to complete..\r"
        sleep 0.2
        echo -ne "(*) Waiting for other package operations to complete...\r"
        sleep 0.2
        echo -ne "\r\033[K"
    done
    sudoIf apt-get "$1"
}

checkNetCoreDeps(){
    if [ $SKIPDOTNETCORE -eq 0 ]; then
        # Install .NET Core dependencies
        if ! "$1" "$2"; then
            echo "(!) .NET Core dependency install failed!"
            exitScript 1
        fi
    fi
}

checkAdditionalDeps(){
    if [ "$ADDITIONAL_DEPS" -ne "" ]; then
        # Install additional dependencies
        if ! "$1" "$2 $ADDITIONAL_DEPS"; then
            echo "(!) Failed to install additional dependencies!"
            exitScript 1
        fi
    fi
}


cat << EOF

Linux Dependency Installer

One or more extensions installed requires a number of prerequisites that this script
will attempt to install for you. This process requires admin / root access.

EOF

# Disable history substitution given use of "!" or errors occur in certain distros
set H+

# Determine the distro if not passed in
if [ "$DISTRO" = "" ]; then
    DISTRO=$(bash ${BASEDIR}/determine-linux-distro.sh || sh ${BASEDIR}/determine-linux-distro.sh)
fi

# If not already root, validate user has sudo access and error if not.
if [ "$(id -u)" -ne 0 ]; then

# Can't indent or text will be indented
cat << EOF
To begin the installation process, your OS will now ask you to enter your
admin / root (sudo) password.

EOF
    # Validate user actually can use sudo
    if ! sudo -v > /dev/null 2>&1; then

# Can't indent or text will be indented
cat << EOF

(!) Dependency installation failed! You do not have the needed admin / root
    access to install Live Share's dependencies. Contact your system admin
    and ask them to install the required libraries described here:
EOF
        echo $3
        exitScript 3
    else
        echo ""
    fi
fi

#openSUSE - Has to be first since apt-get is available but package names different
if [ "$DISTRO" = "SUSE" ]; then
    echo "(*) Detected SUSE (unoffically/community supported)"
    installAdditionalDeps sudoIf "zypper -n in"
    checkNetCoreDeps sudoIf "zypper -n in libopenssl1_0_0 libicu krb5 libz1"

# Debian / Ubuntu
elif [ "$DISTRO" = "Debian" ]; then
    echo "(*) Detected Debian / Ubuntu"
   
    # Get latest package data
    echo -e "\n(*) Updating package lists..."
    if ! aptSudoIf "update"; then
        echo "(!) Failed to update list of available packages!"
        exitScript 1
    fi

    installAdditionalDeps aptSudoIf "install -yq"
    checkNetCoreDeps aptSudoIf "install -yq libicu[0-9][0-9] libkrb5-3 zlib1g $ADDITIONAL_DEPS"
    if [ $SKIPDOTNETCORE -eq 0 ]; then    
        # Determine which version of libssl to install
        # dpkg-query can return "1" in some distros if the package is not found. "2" is an unexpected error
        LIBSSL=$(dpkg-query -f '${db:Status-Abbrev}\t${binary:Package}\n' -W 'libssl1\.0\.?' 2>&1)
        if [ $? -eq 2 ]; then
            echo "(!) Failed see if libssl already installed!"
            exitScript 1
        fi
        if [ "$(echo "$LIBSSL" | grep -o 'libssl1\.0\.[0-9]:' | uniq | sort | wc -l)" -eq 0 ]; then
            # No libssl install 1.0.2 for Debian, 1.0.0 for Ubuntu
            if [[ ! -z $(apt-cache --names-only search ^libssl1.0.2$) ]]; then
                if ! aptSudoIf "install -yq libssl1.0.2"; then
                    echo "(!) libssl1.0.2 installation failed!"
                    exitScript 1
                fi
            else    
                if ! aptSudoIf "install -yq libssl1.0.0"; then
                    echo "(!) libssl1.0.0 installation failed!"
                    exitScript 1
                fi
            fi
        else 
            echo "(*) libssl1.0.x already installed."
        fi
    fi

#RHL/Fedora/CentOS
elif [ "$DISTRO" = "RedHat" ]; then
    echo "(*) Detected RHL / Fedora / CentOS"

    # Update package repo indexes - returns 0 if no pacakges to upgrade,
    # 100 if there are packages to upgrade, and 1 on error
    echo -e "\n(*) Updating package lists..."
    sudoIf "yum check-update" >/dev/null 2>&1
    if [ $? -eq 1 ]; then
        echo "(!) Failed to update package list!"
        exitScript 1
    fi

    installAdditionalDeps sudoIf "yum -y install"
    checkNetCoreDeps sudoIf "yum -y install openssl-libs krb5-libs libicu zlib"  
    # Install openssl-compat10 for Fedora 29. Does not exist in 
    # CentOS, so validate package exists first.
    if [ $SKIPDOTNETCORE -eq 0 ]; then
        if ! sudoIf "yum -q list compat-openssl10" >/dev/null 2>&1; then
            echo "(*) compat-openssl10 not required."
        else
            if ! sudoIf "yum -y install compat-openssl10"; then
                echo "(!) compat-openssl10 install failed"
                exitScript 1
            fi
        fi
    fi

#ArchLinux
elif [ "$DISTRO" = "ArchLinux" ]; then
    echo "(*) Detected Arch Linux (unoffically/community supported)"
    installAdditionalDeps sudoIf "pacman -Sq --noconfirm --needed"
    checkNetCoreDeps sudoIf "pacman -Sq --noconfirm --needed gcr liburcu openssl-1.0 krb5 icu zlib"

#Solus
elif [ "$DISTRO" = "Solus" ]; then
    echo "(*) Detected Solus (unoffically/community supported)"
    installAdditionalDeps sudoIf "eopkg -y it"
    checkNetCoreDeps sudoIf "eopkg -y it libicu openssl zlib kerberos"

#Alpine Linux
elif [ "$DISTRO" = "Alpine" ]; then
    echo "(*) Detected Alpine Linux"
    
    # Update package repo indexes    
    echo -e "\n(*) Updating and upgrading..."
    if ! sudoIf "apk update --wait 30"; then
        echo "(!) Failed to update package lists."
        exitScript 1
    fi
    # Upgrade to avoid package dependency conflicts
    if ! sudoIf "apk upgrade"; then
        echo "(!) Failed to upgrade."
        exitScript 1
    fi

    installAdditionalDeps sudoIf "apk add --no-cache"
    sudoIf "apk add --no-cache libssl1.0 icu krb5 zlib"

# Unknown distro
else
    echo -e "(!) We are unable to install dependencies for this version of Linux.\nSee $MORE_INFO for info on requirements."
    exit 4
    # Don't pause on exit here - we'll handle this in the extension
fi

echo -e "\n(*) Success!\n"
# Don't pause on exit here - we'll handle this in the extension