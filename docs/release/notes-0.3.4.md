# DUO 0.3.4 release notes

DUO 0.3.4 is a security patch for 0.3.3, published to the npm dist-tag `latest`. It updates two bundled runtime dependencies that have published advisories. Nothing else changed: reviews, context, Decisions, the MCP tools and the CLI behave exactly as in 0.3.3.

0.3.x is the supported line for security fixes ([SECURITY.md](../../SECURITY.md)). External Validation 01 keeps using exactly 0.2.1.

## Security: MCP SDK and zod updates

DUO 0.3.3 bundles `@modelcontextprotocol/server`, `client` and `core` 2.2.0 and `zod` 4.6.5. These versions are affected by:

| Advisory | Package | Severity | Summary |
|---|---|---|---|
| [GHSA-jm63-cq47-j5jp](https://github.com/advisories/GHSA-jm63-cq47-j5jp) | `@modelcontextprotocol/server` < 2.3.0 | high | A shared HTTP transport or server instance could deliver one client's messages to another |
| [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453) | `@modelcontextprotocol/server` < 2.3.0 | high | One HTTP request within the default size limit could exhaust memory during validation |
| [GHSA-rvq5-wwqv-78pq](https://github.com/advisories/GHSA-rvq5-wwqv-78pq) | `@modelcontextprotocol/server` < 2.3.0 | medium | Bearer authentication accepted tokens issued for another service |
| [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw) | `@modelcontextprotocol/client` < 2.3.0 | medium | HTTP client transports and OAuth followed cross-origin redirects with headers and bodies |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | `zod` < 4.6.6 | high | Memory exhaustion while validating oversized constrained collections |

DUO serves MCP over stdio only and uses the MCP client only to check over stdio that an agent can start the DUO server. It configures no HTTP transport, OAuth or bearer authentication, and we found no DUO code path that reaches the four MCP SDK issues. DUO does use zod to validate MCP tool input and local UI requests, including size-limited lists. That input comes from a local agent or from the loopback UI with a session, so a local caller could reach the affected validation. 0.3.4 updates both packages instead of relying on that analysis.

0.3.4 bundles `@modelcontextprotocol/client`, `server` and `core` 2.3.1 and `zod` 4.6.7. No other bundled package changed: there are still 67 packages and no install scripts. `release:audit` reports no advisories for the package.

## License change in a bundled dependency

The MCP SDK changed its license from MIT (2.2.0) to Apache-2.0 (2.3.1). `dist/THIRD_PARTY_NOTICES.md` names the new license and includes the SDK's full LICENSE text. DUO itself is Apache-2.0.

## Unchanged

Project Truth (`schema_version: 1`), the Decision Lock, every `/1` format, the nine MCP tools with their names, schemas and annotations, the UI API, CLI commands, options and exit codes, and the Graph format. A repository used with 0.3.3 opens in 0.3.4 without migration. The index stays current.

## Upgrade

Install `@duo-director/cli@0.3.4` globally or as the project's dev dependency, then run `duoctl status`. There is no need to rerun `duoctl install`; the generated agent configuration is unchanged.

## Going back

0.3.3 reads the same Project Truth, but it bundles the affected dependency versions.

## Known limitations

Same as [0.3.3](notes-0.3.3.md#known-limitations).
