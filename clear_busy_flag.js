// Clear the busy flag directly via Node.js
const http = require('http');

// Make a request to force restart (simpler approach)
console.log('Clearing busy flag by stopping any running simulation...');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const loginData = JSON.stringify({
  username: 'testuser123',
  password: 'SecurePass123!'
});

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const response = JSON.parse(data);
    const token = response.token;
    
    if (!token) {
      console.log('❌ Login failed');
      process.exit(1);
    }
    
    console.log('✅ Logged in');
    
    // Now stop simulation to clear busy flag
    const stopOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/paper-sim/stop',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-app-mode': 'paper'
      }
    };
    
    const stopReq = http.request(stopOptions, (stopRes) => {
      let stopData = '';
      stopRes.on('data', (chunk) => { stopData += chunk; });
      stopRes.on('end', () => {
        console.log('Stop response:', JSON.parse(stopData));
        console.log('✅ Busy flag should now be cleared');
      });
    });
    
    stopReq.on('error', (e) => {
      console.error('Stop error:', e);
    });
    
    stopReq.end();
  });
});

req.on('error', (e) => {
  console.error('Login error:', e);
});

req.write(loginData);
req.end();
