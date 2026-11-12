# Synthetic voice references

Accepted by the user for the first version on 12 November 2026, with known quality differences. No new listening gate is required for this integration. The Norwegian pronunciation issue remains unresolved. See docs/plan-voxcpm2.md and the review reports.

Generated with VoxCPM2 from text descriptions, without recordings or clones of real people. Distributed separately under LICENSE.txt; never bundled with installers. scripts/prepare-voxcpm-voices.mjs verifies them against src/main/ttsCatalog.json before creating release assets.

| Language | Voice | Seconds |
|---|---|---|
| en-us | woman | 4.00 |
| en-us | man | 4.64 |
| nb | woman | 4.00 |
| nb | man | 3.50 |
| sv | woman | 3.04 |
| sv | man | 3.20 |
| da | woman | 2.88 |
| da | man | 3.52 |
| de | woman | 3.36 |
| de | man | 3.52 |

The target for later reference work is 3–4 seconds. The accepted first version keeps the complete 4.64 s US male and 2.88 s Danish female recordings. They have not been cut to meet the target.
