# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-18

### Added
- **End-to-End Encrypted Chat Application**: Initial release of secure chat web application
  - WebSocket-based real-time messaging with relay server
  - End-to-end encryption for secure communication
  - Client-side encryption/decryption using Web Crypto API
  
- **Core Features**:
  - Real-time chat interface with WebSocket support
  - Automatic WebSocket address detection based on protocol (ws/wss)
  - Persistent storage using local data
  - Responsive web design with modern CSS styling
  
- **Deployment Support**:
  - Automated deployment script (`deploy.sh`) for Linux servers
  - Windows batch script (`upload-to-server.bat`) for easy file upload
  - PM2 process manager integration for production environments
  - Multiple deployment guides:
    - Quick deployment guide (`README_DEPLOY.md`)
    - Cloud deployment guide (`CLOUD_DEPLOY.md`)
    - General deployment instructions (`DEPLOY.md`)
  
- **Server Infrastructure**:
  - Express.js HTTP server with WebSocket support
  - WebSocket relay server for message routing
  - Static file serving for web interface
  - Configurable port (default: 4000)
  
- **Documentation**:
  - Comprehensive deployment guides for various scenarios
  - Firewall and security group configuration instructions
  - PM2 service management commands
  - Domain and HTTPS configuration guidelines

### Technical Details
- Built with vanilla JavaScript (no frameworks)
- Uses `ws` library (v8.16.0) for WebSocket implementation
- Express.js (v4.19.2) for HTTP server
- Node.js backend with minimal dependencies
- Client-side cryptography for privacy

[1.0.0]: https://github.com/yourusername/Xchat/releases/tag/v1.0.0
