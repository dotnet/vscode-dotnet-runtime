/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';

export type Architecture = 'x86' | 'x64' | 'arm64' | 'other' | null;

/**
 * Class responsible for determining executable file architectures across different platforms.
 */
export class ExecutableArchitectureDetector
{
    /**
     * Magic number constants for executable format detection
     */
    private static readonly EXECUTABLEFILESIGNATURES =
        {
            // ELF Format: 0x7F followed by 'ELF' in ASCII
            ELF: {
                DELIMITER: 0x7F,
                E: 0x45,
                L: 0x4C,
                F: 0x46
            },
            // Mach-O Format: 0xCF 0xFA 0xED 0xFE (Little-endian format)
            MACHO: {
                CF: 0xCF,
                FA: 0xFA,
                ED: 0xED,
                FE: 0xFE
            },
            // DOS/PE Format: 'MZ' in ASCII (Mark Zbikowski, format creator)
            PE: {
                M: 0x4D,
                Z: 0x5A
            }
        };

    /**
     * Determines the target architecture of an executable file.
     * Supports Windows PE/COFF, macOS Mach-O, and Linux ELF formats.
     *
     * @param executablePath Full path to the executable file
     * @returns The target architecture or null if it cannot be determined.
     * Supported values are 'x86', 'x64', 'arm64', 'other', or null if the file is not recognized.
     */
    public getExecutableArchitecture(executablePath: string): Architecture
    {
        try
        {
            // Create a buffer for reading the header, which is a maximum of 64 bytes for our purposes.
            const headerBuffer = Buffer.alloc(64);
            const fd = readFileSync(executablePath);

            fd.copy(headerBuffer, 0, 0, 64);

            if (headerBuffer.length < 64)
            {
                return null;
            }

            // Detect file format based on magic numbers
            if (this.isElfFormat(headerBuffer))
            {
                return this.getElfArchitecture(headerBuffer);
            }
            else if (this.isMachOFormat(headerBuffer))
            {
                return this.getMachOArchitecture(headerBuffer);
            }
            else if (this.isPEFormat(headerBuffer))
            {
                return this.getPEArchitecture(executablePath);
            }

            return null;
        }
        catch (error)
        {
            return null;
        }
    }

    public static IsKnownArchitecture(architecture: Architecture): boolean
    {
        return architecture !== null && architecture !== 'other';
    }

    /**
     * Checks if the file is in ELF format
     * Magic number: 0x7F 'ELF'
     * Reference: https://en.wikipedia.org/wiki/Executable_and_Linkable_Format#File_header
     */
    private isElfFormat(header: Buffer): boolean
    {
        return header[0] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.ELF.DELIMITER &&
            header[1] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.ELF.E &&
            header[2] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.ELF.L &&
            header[3] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.ELF.F;
    }

    /**
     * Checks if the file is in Mach-O format
     * Magic number: 0xCF 0xFA 0xED 0xFE (Little-endian format)
     * Reference: https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h
     */
    private isMachOFormat(header: Buffer): boolean
    {
        return header[0] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.MACHO.CF &&
            header[1] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.MACHO.FA &&
            header[2] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.MACHO.ED &&
            header[3] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.MACHO.FE;
    }

    /**
     * Checks if the file is in PE/COFF format
     * Magic number: 'MZ' (DOS header)
     * Reference: https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
     */
    private isPEFormat(header: Buffer): boolean
    {
        return header[0] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.PE.M &&
            header[1] === ExecutableArchitectureDetector.EXECUTABLEFILESIGNATURES.PE.Z;
    }

    /**
     * Parse ELF format architecture
     * Reference: https://en.wikipedia.org/wiki/Executable_and_Linkable_Format#File_header
     * Specification: https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.eheader.html
     */
    private getElfArchitecture(header: Buffer): Architecture
    {
        // e_machine field is at offset 0x12 (18)
        const machine = header.readUInt16LE(0x12);

        // Values from: https://en.wikipedia.org/wiki/Executable_and_Linkable_Format#Machine_codes
        switch (machine)
        {
            case 0x03: return 'x86';      // EM_386
            case 0x3E: return 'x64';      // EM_X86_64
            case 0xB7: return 'arm64';    // EM_AARCH64
            default: return 'other';
        }
    }

    /**
     * Parse Mach-O format architecture
     * Reference: https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h
     */
    private getMachOArchitecture(header: Buffer): Architecture
    {
        // CPU type is at offset 0x4
        const cpuType = header.readUInt32LE(0x4);

        // Values from: https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/machine.h
        switch (cpuType)
        {
            case 0x7: return 'x86';     // CPU_TYPE_X86
            case 0x1000007: return 'x64'; // CPU_TYPE_X86_64
            case 0x100000C: return 'arm64'; // CPU_TYPE_ARM64
            default: return 'other';
        }
    }

    /**
     * Parse PE/COFF format architecture
     * Reference: https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
     * Specification: https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#machine-types
     */
    private getPEArchitecture(executablePath: string): Architecture
    {
        try
        {
            const fileContent = readFileSync(executablePath);

            // Read PE header offset from DOS header
            const peOffset = fileContent.readUInt32LE(0x3C);

            // Verify PE signature "PE\0\0" (0x50450000)
            if (fileContent.readUInt32LE(peOffset) !== 0x4550)
            {
                return null;
            }

            // Machine type is at offset 0x4 after PE signature
            const machine = fileContent.readUInt16LE(peOffset + 4);

            switch (machine)
            {
                case 0x14C: return 'x86';    // IMAGE_FILE_MACHINE_I386
                case 0x8664: return 'x64';   // IMAGE_FILE_MACHINE_AMD64
                case 0xAA64: return 'arm64'; // IMAGE_FILE_MACHINE_ARM64
                default: return 'other';
            }
        }
        catch (error)
        {
            return null;
        }
    }
}