# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-11-18

### Added
- **End-to-End Encrypted Chat Application**: Complete secure chat system with browser-based encryption
- **User Authentication System**: Login and registration functionality with secure token-based authentication
- **Real-time Messaging**: WebSocket-based real-time communication with automatic reconnection
- **Session Management**: Support for multiple chat sessions with unread message tracking
- **Local Key Generation**: Browser-based cryptographic key generation and management
- **Message History**: Persistent local storage of encrypted message history
- **User Profile Management**: Customizable user profiles with display names
- **WebSocket Server**: Express.js + WebSocket server for message relay
- **Deployment Tools**: 
  - Automated deployment script (`deploy.sh`) for Linux servers
  - Windows batch script (`upload-to-server.bat`) for easy file upload
  - Comprehensive deployment guides (DEPLOY.md, CLOUD_DEPLOY.md, README_DEPLOY.md)
- **PM2 Integration**: Production-ready process management configuration
- **Security Features**:
  - Client-side encryption/decryption
  - Key fingerprint verification
  - Secure passphrase handling
  - No plaintext storage on server

### Technical Details
- **Frontend**: Vanilla JavaScript with modern Web Crypto API
- **Backend**: Node.js with Express.js and WebSocket (ws library)
- **Storage**: LocalStorage for client-side data, JSON file for server-side data
- **Auto-detection**: Automatic WebSocket URL detection based on deployment environment

[Unreleased]: https://github.com/yourusername/xchat/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/xchat/releases/tag/v1.0.0
