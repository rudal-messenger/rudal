import React from "react";

export default function Login() {
  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      height: "100vh" 
    }}>
      <h2>Login to Rudal</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: "10px", width: "200px" }}>
        <input type="text" placeholder="rID or email" />
        <input type="password" placeholder="Password" />
        <button type="submit">Sign In</button>
      </form>
      <p style={{ marginTop: "10px", color: "gray" }}>Don’t have an account? Sign up!</p>
    </div>
  );
}
