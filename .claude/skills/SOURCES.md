# Skills de sécurité installés (13/11/2026)

Copiés depuis leurs dépôts publics, relus par Claude avant installation (aucune commande d'installation
externe, aucun envoi de données ; les exemples de code malveillant sont pédagogiques). Chaque dossier garde
la licence d'origine dans `LICENSE-source`. Claude Code charge automatiquement `.claude/skills/`.

| Skill | Source | Licence |
|---|---|---|
| laravel-security | github.com/affaan-m/ecc | MIT |
| security-review | github.com/getsentry/skills | Apache-2.0 |
| security-and-hardening | github.com/addyosmani/agent-skills | MIT |
| security-audit | github.com/cloudflare/security-audit-skill | MIT |
| owasp-security | github.com/agamm/claude-code-owasp | MIT |
| threat-mitigation-mapping, auth-implementation-patterns, pci-compliance, security-requirement-extraction, stride-analysis-patterns | github.com/wshobson/agents | MIT |
| skill-vetter | github.com/useai-pro/openclaw-skills-security | MIT |
| differential-review, supply-chain-risk-auditor | github.com/trailofbits/skills | CC BY-SA 4.0 (attribution : Trail of Bits) |

Écartés : `security-scan` (installe un paquet npm externe et demande une clé d'API), `better-auth/*`
(spécifique JavaScript, licence non trouvée). Avant d'ajouter un autre skill : le faire vérifier par `skill-vetter`.
