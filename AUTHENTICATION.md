# Authentication & Token Refresh

This document explains how authentication and automatic token refresh work in the Jellyfin Playlist Manager.

## Overview

The application implements automatic token refresh to handle expired authentication tokens seamlessly. When a token expires, the app automatically attempts to refresh it using stored credentials, ensuring users don't get logged out unexpectedly.

## How It Works

### 1. Initial Authentication

When users log in:

1. Credentials (server URL, username, password) are stored in `localStorage`
2. Authentication token is stored as an HTTP-only cookie (`jellyfin-auth-token`)
3. User and token information is stored in Zustand state for the session

### 2. Token Storage

- **Cookie**: `jellyfin-auth-token` - Used by middleware for route protection
- **localStorage**: Credentials for token refresh
- **Zustand Store**: Session state management

### 3. Automatic Token Refresh

When any API call receives a 401 or 403 error:

1. **Error Detection**: The `authClient.withTokenRefresh()` wrapper detects authentication errors
2. **Credential Retrieval**: Stored credentials are retrieved from `localStorage`
3. **Re-authentication**: A new authentication request is made to Jellyfin
4. **Token Update**: New token is stored in cookie and updated in the client
5. **Retry**: Original API call is retried with the new token
6. **Fallback**: If refresh fails, user is logged out and redirected to login

### 4. Concurrent Request Handling

- Multiple simultaneous requests that fail with auth errors share a single refresh attempt
- Subsequent requests wait for the ongoing refresh to complete
- All requests are retried once the new token is available

## Implementation Details

### Core Components

#### `AuthClient` (`src/lib/api/auth-client.ts`)

- Handles token refresh logic
- Manages concurrent refresh attempts
- Detects authentication errors
- Provides `withTokenRefresh()` wrapper

#### `JellyfinClient` (`src/lib/api/jellyfin.ts`)

- All API methods wrapped with `authClient.withTokenRefresh()`
- Automatically handles token refresh on auth errors
- Updates internal token when refresh occurs

#### `AuthStore` (`src/lib/store/auth.ts`)

- Manages authentication state
- Persists user and token information
- Handles login/logout operations

### Error Detection

The system detects authentication errors by checking for:

- HTTP status codes: 401 (Unauthorized) or 403 (Forbidden)
- Error messages containing: "unauthorized", "forbidden", "authentication", "token"

### Refresh Process

```typescript
// Simplified flow
try {
  return await apiOperation();
} catch (error) {
  if (isAuthError(error)) {
    await refreshToken();
    return await apiOperation(); // Retry
  }
  throw error;
}
```

## Testing Token Refresh

### Development Tools

In development mode, testing utilities are available in the browser console:

```javascript
// Simulate token expiration
AuthTestUtils.simulateTokenExpiration();

// Clear token completely
AuthTestUtils.clearToken();

// Check if credentials are stored
AuthTestUtils.hasStoredCredentials();

// Temporarily corrupt credentials (returns restore function)
const { restore } = AuthTestUtils.corruptStoredCredentials();

// Log current auth state
AuthTestUtils.logAuthState();
```

### Manual Testing Steps

1. **Setup**: Log into the app normally
2. **Simulate Expiration**:
   - Open browser dev tools
   - Go to Application > Cookies
   - Modify the `jellyfin-auth-token` value to make it invalid
3. **Test Refresh**: Perform any action (view playlists, search, etc.)
4. **Verify**: Check console for refresh messages and successful operation

### Expected Console Output

```
🔑 Auth error detected, attempting token refresh...
🔄 Attempting to refresh authentication token...
✅ Token refresh successful
🔄 Token refreshed, retrying operation...
```

## Error Scenarios

### Successful Refresh

- Token expires → Automatic refresh → Operation continues seamlessly
- User remains logged in and unaware of the refresh

### Failed Refresh

- Stored credentials are invalid → Refresh fails → User logged out → Redirect to login
- No stored credentials → Immediate logout and redirect

### Network Issues

- Temporary network failure during refresh → Error thrown to user
- User can retry the operation manually

## Security Considerations

### Credential Storage

- Credentials stored in `localStorage` (not ideal for production)
- Consider using more secure storage methods for production deployment
- Tokens stored as HTTP-only cookies for better security

### Token Lifecycle

- Tokens automatically refresh before expiration when possible
- Failed refresh immediately clears all authentication state
- No indefinite retry attempts to prevent infinite loops

## Configuration

### Token Expiration

- Jellyfin server configuration determines token lifetime
- No client-side configuration needed for refresh mechanism

### Storage Keys

```typescript
const STORAGE_KEYS = {
  SERVER_URL: "jellyfin-server-url",
  USERNAME: "jellyfin-username",
  PASSWORD: "jellyfin-password",
} as const;
```

## Troubleshooting

### Common Issues

1. **Refresh Loop**: If tokens keep expiring immediately

   - Check Jellyfin server time synchronization
   - Verify server configuration

2. **Credentials Not Found**: If refresh fails with "No stored credentials"

   - User needs to log in again
   - Check localStorage for credential keys

3. **CORS Issues**: If refresh fails with network errors
   - Verify Jellyfin server CORS configuration
   - Check network connectivity

### Debug Information

Enable debug logging by checking browser console for:

- `🔄` Token refresh attempts
- `✅` Successful operations
- `❌` Failed operations
- `🧪` Test utility messages

## Future Improvements

### Potential Enhancements

- Proactive token refresh before expiration
- More secure credential storage (encrypted)
- Retry with exponential backoff
- Token refresh progress indicators
- Background refresh for long-running operations

### Security Improvements

- Implement secure token storage
- Add token rotation
- Implement refresh token pattern
- Add session timeout handling
