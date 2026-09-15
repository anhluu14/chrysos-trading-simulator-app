#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("🔐 Setting up secure environment configuration...\n");

// Check if .env file exists
const envPath = path.join(__dirname, "..", ".env");
const envExists = fs.existsSync(envPath);

if (envExists) {
  console.log("✅ .env file already exists");
} else {
  console.log("📝 Creating .env file...");

  const envContent = `# Crypto News API Configuration
NEWS_API_KEY=your_news_api_key_here

# Other API keys can be added here
# COIN_GECKO_API_KEY=your_coin_gecko_key_here
# ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here

# Environment
ENVIRONMENT=development
`;

  fs.writeFileSync(envPath, envContent);
  console.log("✅ .env file created successfully");
}

// Check if .env is in .gitignore
const gitignorePath = path.join(__dirname, "..", ".gitignore");
const gitignoreExists = fs.existsSync(gitignorePath);

if (gitignoreExists) {
  const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");

  if (gitignoreContent.includes(".env")) {
    console.log("✅ .env is already in .gitignore");
  } else {
    console.log("⚠️  .env is not in .gitignore - adding it...");
    fs.appendFileSync(gitignorePath, "\n# Environment variables\n.env\n");
    console.log("✅ .env added to .gitignore");
  }
} else {
  console.log("⚠️  .gitignore not found - creating it...");
  fs.writeFileSync(gitignorePath, "# Environment variables\n.env\n");
  console.log("✅ .gitignore created with .env entry");
}

console.log("\n🎉 Environment setup completed!");
console.log("\n📋 Next steps:");
console.log("1. Replace the placeholder in .env with your own API key");
console.log("2. The .env file is ignored by git for security");
console.log("3. The app will use SecureStore for sensitive data");
console.log("4. You can update API keys in the .env file as needed");
console.log("\n🔒 Security features:");
console.log("- API keys are stored in device SecureStore");
console.log("- Environment variables are loaded securely");
console.log("- Fallback data is available if API fails");
console.log("- No sensitive data is logged or exposed");
