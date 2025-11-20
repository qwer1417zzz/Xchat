# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-18

### Added

#### Core Features
- **End-to-End Encryption (E2EE)**: Implemented client-side encryption using Web Crypto API with AES-GCM 256-bit encryption
- **User Authentication System**: Account registration and login functionality with secure credential storage
- **Real-time Chat**: WebSocket-based messaging system for instant communication
- **Session Management**: Create and join private chat rooms with configurable capacity (2-12 members)
- **Friend System**: Add friends by ID, send and accept friend requests

#### Security Features
- **Shared Key Generation**: Browser-based key derivation from shared passphrase using PBKDF2
- **Key Fingerprint**: Visual verification of encryption keys for security validation
- **Password Visibility Toggle**: Secure password input with show/hide functionality
- **Client-side Encryption**: All messages encrypted locally before transmission through relay server

#### User Interface
- **Modern Chat Interface**: Clean, responsive design with sidebar navigation and chat view
- **Profile Management**: View user ID, username, and account information
- **Session List**: Detailed and compact view modes for active chat sessions
- **Message History**: Local storage of encrypted message history per session
- **Toast Notifications**: User-friendly notifications for actions and events
- **Collapsible Panels**: Organized UI with expandable/collapsible sections

#### Messaging Features
- **Text Messaging**: Send and receive encrypted text messages in real-time
- **Message Timestamps**: Display message send time for context
- **Message Deletion**: Delete own messages from chat history
- **Unread Message Counter**: Track unread messages per session
- **Chat History Management**: Clear chat history per session

#### Session Features
- **Session Creation**: Create new encrypted chat rooms with custom names and capacity
- **Session Join/Leave**: Join existing sessions and leave when needed
- **Participant Tracking**: Real-time display of active members in session
- **Session Refresh**: Manual refresh capability for session state
- **Pagination**: Navigate through session list with pagination controls

#### Technical Features
- **WebSocket Relay Server**: Node.js/Express server with ws library for message relay
- **Connection Management**: Automatic reconnection and connection status indicators
- **Server URL Configuration**: Customizable relay server endpoint
- **Activity Logging**: Detailed runtime logs for debugging and monitoring
- **LocalStorage Integration**: Persistent storage for chat history and user preferences

#### Deployment
- **Deployment Scripts**: Automated deployment scripts for various hosting platforms
- **Cloud Deployment Guide**: Comprehensive documentation for cloud deployment (Heroku, Railway, Render, etc.)
- **Server Deployment Guide**: Instructions for traditional VPS/server deployment
- **Windows Batch Upload**: Convenient upload script for Windows users

### Documentation
- **CLOUD_DEPLOY.md**: Complete guide for deploying to cloud platforms
- **DEPLOY.md**: Traditional server deployment instructions
- **README_DEPLOY.md**: Quick start deployment reference

### Initial Release
This is the first public release of the Secure Chat Web application, providing a complete end-to-end encrypted chat solution that runs entirely in the browser with a lightweight relay server. All encryption and decryption happens client-side, ensuring that the relay server never has access to message content.

---

[1.0.0]: https://github.com/yourusername/yourrepo/releases/tag/v1.0.0
