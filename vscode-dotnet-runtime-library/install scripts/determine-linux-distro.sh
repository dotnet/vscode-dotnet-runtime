#!/usr/bin/env bash
#
# Copyright © Microsoft Corporation
# All rights reserved.
#
# Licensed under the MIT License. See LICENSE-CODE in the project root for details.
#
# Exit codes:
# 0 - Success
# 4 - Distribution not supported by script
#

set -H

# Function to detect distro from os-release
detect_from_os_release() {
    if [ -f "/etc/os-release" ]; then
        . /etc/os-release
        case "$ID" in
            fedora|rhel|centos|rhel-idm|almalinux|rocky|nobara)
                echo "RedHat"
                return 0
                ;;
            ubuntu|debian)
                echo "Debian"
                return 0
                ;;
            opensuse*|sles)
                echo "SUSE"
                return 0
                ;;
            arch|archlinux)
                echo "ArchLinux"
                return 0
                ;;
            alpine)
                echo "Alpine"
                return 0
                ;;
            solus)
                echo "Solus"
                return 0
                ;;
        esac
    elif [ -f "/usr/lib/os-release" ]; then
        . /usr/lib/os-release
        case "$ID" in
            fedora|rhel|centos|rhel-idm|almalinux|rocky|nobara)
                echo "RedHat"
                return 0
                ;;
            ubuntu|debian)
                echo "Debian"
                return 0
                ;;
            opensuse*|sles)
                echo "SUSE"
                return 0
                ;;
            arch|archlinux)
                echo "ArchLinux"
                return 0
                ;;
            alpine)
                echo "Alpine"
                return 0
                ;;
            solus)
                echo "Solus"
                return 0
                ;;
        esac
    fi
    return 1
}

# Check if running in Flatpak or similar container where package managers aren't accessible
if [ -n "$FLATPAK_ID" ] || [ -n "$FLATPAK_VERSION" ] || [ -f "/.flatpak-info" ] || [ -d "/run/flatpak" ]; then
    # Try to get distro from os-release since package managers may not be accessible
    if detect_from_os_release; then
        exit 0
    fi
fi

#openSUSE - Has to be first since apt-get is available but package names different
if type zypper > /dev/null 2>&1; then
    echo "SUSE"
    exit 0

# Debian / Ubuntu
elif type apt-get > /dev/null 2>&1; then
    echo "Debian"
    exit 0

#RHL/Fedora/CentOS
elif type yum > /dev/null 2>&1; then
    echo "RedHat"
    exit 0

#ArchLinux
elif type pacman > /dev/null 2>&1; then
    echo "ArchLinux"
    exit 0

#Solus
elif type eopkg > /dev/null 2>&1; then
    echo "Solus"
    exit 0

#Alpine Linux
elif type apk > /dev/null 2>&1; then
    echo "Alpine"
    exit 0

# Try os-release as fallback for other environments
elif detect_from_os_release; then
    exit 0

# Distro not supported
else
   echo "UNKNOWN"
   exit 4
fi
