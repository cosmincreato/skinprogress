/**
 * Authentication service client
 * Handles email registration, confirmation, and login flows
 * Communicates with backend C# APIs via HTTP
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

export interface RegistrationRequest {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ConfirmEmailRequest {
  token: string;
}

/**
 * Register new user with email and password
 * Sends confirmation email to user
 */
export async function registerWithEmail(
  request: RegistrationRequest
): Promise<{ message: string; email: string; userId: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/email/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Registration failed");
  }

  return response.json();
}

/**
 * Confirm email using token from confirmation email link
 * Must be called before login is allowed
 */
export async function confirmEmail(
  request: ConfirmEmailRequest
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/email/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Email confirmation failed");
  }

  return response.json();
}

/**
 * Resend confirmation email to an unconfirmed account.
 * Rate-limited to one resend per 5 minutes.
 */
export async function resendConfirmationEmail(
  email: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/email/resend-confirmation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to resend confirmation email");
  }

  return response.json();
}

/**
 * Login user with email and password
 * Returns JWT access and refresh tokens
 * Can only login after email is confirmed
 */
export async function loginWithEmail(
  request: LoginRequest
): Promise<AuthTokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/email/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Login failed");
  }

  const data: AuthTokenResponse = await response.json();

  // Store tokens in localStorage
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
  localStorage.setItem("userId", data.user.id);
  localStorage.setItem("userEmail", data.user.email);

  return data;
}

/**
 * Get stored access token from localStorage
 */
export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

/**
 * Get current auth token (supports both OAuth jwt and email auth accessToken)
 * Returns the first available token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem("accessToken") || localStorage.getItem("jwt");
}

/**
 * Get stored refresh token from localStorage
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

/**
 * Get current user ID from localStorage
 */
export function getUserId(): string | null {
  return localStorage.getItem("userId");
}

/**
 * Get current user email from localStorage
 */
export function getUserEmail(): string | null {
  return localStorage.getItem("userEmail");
}

/**
 * Check if user is authenticated (has valid access token or JWT token from OAuth)
 */
export function isAuthenticated(): boolean {
  return !!(getAccessToken() || localStorage.getItem("jwt"));
}

/**
 * Simple JWT decoder - extracts payload without verification
 * In production, verify the token signature on the backend
 */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract userId from JWT token
 * Handles both standard NameIdentifier claim and sub claim
 */
function extractUserIdFromToken(token: string): string | null {
  const decoded = decodeJwt(token);
  if (!decoded) return null;
  
  // Try standard NameIdentifier claim (used by .NET)
  if (decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']) {
    return decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] as string;
  }
  
  // Try 'sub' claim (standard JWT)
  if (decoded.sub) {
    return decoded.sub as string;
  }
  
  // Try common alternatives
  if (decoded.userid) {
    return decoded.userid as string;
  }
  
  return null;
}

/**
 * Store OAuth token (from Google/Apple) in localStorage
 */
export function storeOAuthToken(token: string, username: string, email: string): boolean {
  try {
    const userId = extractUserIdFromToken(token);
    if (!userId) {
      console.error("Could not extract userId from token");
      return false;
    }
    
    localStorage.setItem("jwt", token);
    localStorage.setItem("userId", userId);
    localStorage.setItem("userEmail", email);
    localStorage.setItem("username", username);
    
    return true;
  } catch (error) {
    console.error("Error storing OAuth token:", error);
    return false;
  }
}

export function logout(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("jwt");
  localStorage.removeItem("userId");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("username");
}

/**
 * Get authorization header with Bearer token
 * Used for authenticated API requests
 */
export function getAuthHeader(): HeadersInit {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}
