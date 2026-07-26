# Reliability verification fixture

The mock server is development-only. It binds only to `127.0.0.1:8012`, makes no external request, and accepts no credential.

## Start a slow streaming response

```bash
npm run mock:sse
```

Set the Companion endpoint to `http://127.0.0.1:8012/v1/chat/completions`, send a message, then press **Stop** after the first chunk.

Expected result:

- The response stops immediately and the Send control becomes available.
- The server's `aborted` count increases.
- Waiting longer does not append another chunk.
- A new message can be sent normally.

## Exercise retry cancellation and exhaustion

```bash
npm run mock:429
```

Use the same endpoint.

- Press **Stop** before the 3-second retry delay expires: `requests=1` remains unchanged after waiting.
- Do not press Stop: the server receives exactly four requests (initial request plus three retries), then the UI shows the terminal retry-exhausted message and returns to Ready.

`npm test` covers the fixture's basic SSE and 429 protocol behavior. The Stop
and retry-cancellation flows remain manual UI acceptance checks using this fixture.
