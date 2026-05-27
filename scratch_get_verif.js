async function main() {
  try {
    console.log("Logging in as admin...");
    const loginRes = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@talentnest.com',
        password: 'Admin@123'
      })
    });

    const loginData = await loginRes.json();
    console.log("Login Data:", loginData);
    const token = loginData.token;
    if (!token) {
      console.error("Token not found in login response!");
      return;
    }

    console.log("Fetching verifications...");
    const verifRes = await fetch('http://localhost:5000/api/admin/verifications', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const verifData = await verifRes.json();
    console.log("Verifications Data:", JSON.stringify(verifData, null, 2));

  } catch (error) {
    console.error("Error calling API:", error);
  }
}

main();
