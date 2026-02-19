import jwt from "jsonwebtoken";

/**
 * Middleware to authenticate WebSocket connections using JWT tokens
 * Extracts token from socket handshake auth header or query parameters
 */
export const socketAuthMiddleware = (socket, next) => {
  try {
    let token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization ||
      socket.handshake.query.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    if (typeof token === "string" && token.startsWith("Bearer ")) {
      token = token.slice(7);
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    socket.userId = decoded.id;
    socket.userRole = decoded.role || "admin";
    socket.userEmail = decoded.email;

    next();
  } catch (error) {
    next(new Error(`Authentication error: ${error.message}`));
  }
};

/**
 * Optional: For public connections (e.g., payment status updates)
 * that don't require authentication
 */
export const guestAuthMiddleware = (socket, next) => {
  socket.userId = `guest-${socket.id}`;
  next();
};
