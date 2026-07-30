import type { JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { ToolRegistry } from "./tools.js";

export const SKILL_SCHEMA_ID = `${SCHEMA_BASE_URL}payloads/skill-payload.schema.json`;

export interface DeclarativeSkill {
  readonly schemaVersion: 1;
  readonly language: "seh.skill.v1";
  readonly skillId: string;
  readonly summary: string;
  readonly allowedToolIds: readonly string[];
  readonly steps: readonly {
    readonly stepId: string;
    readonly kind: "instruction" | "tool_guidance" | "evidence_check" | "completion_check";
    readonly instruction: string;
    readonly toolId?: string;
  }[];
  readonly completionChecks: readonly string[];
}

export class SkillRegistry {
  readonly #skills = new Map<string, DeclarativeSkill>();
  readonly #schemas: SchemaRegistry;
  readonly #tools: ToolRegistry;
  #sealed = false;

  public constructor(schemas: SchemaRegistry, tools: ToolRegistry) {
    this.#schemas = schemas;
    this.#tools = tools;
  }

  public register(value: JsonValue): DeclarativeSkill {
    assertCondition(!this.#sealed, "CONFLICT", "Skill registry is sealed");
    this.#schemas.validate(SKILL_SCHEMA_ID, value);
    const skill = value as unknown as DeclarativeSkill;
    assertCondition(!this.#skills.has(skill.skillId), "CONFLICT", "Duplicate skill ID");
    for (const toolId of skill.allowedToolIds) {
      assertCondition(this.#tools.hasToolId(toolId), "TOOL_NOT_FOUND", `Unknown skill tool ${toolId}`);
    }
    for (const step of skill.steps) {
      if (step.kind === "tool_guidance") {
        assertCondition(
          step.toolId !== undefined && skill.allowedToolIds.includes(step.toolId),
          "AUTHORIZATION_DENIED",
          "Skill step names a tool outside its declared capability set",
        );
      }
    }
    this.#skills.set(skill.skillId, skill);
    return skill;
  }

  public seal(): void {
    this.#sealed = true;
  }

  public get(skillId: string): DeclarativeSkill {
    const skill = this.#skills.get(skillId);
    assertCondition(skill !== undefined, "SCHEMA_INVALID", `Unknown skill ${skillId}`);
    return skill;
  }

  public render(skillIds: readonly string[]): string {
    const sections: string[] = [];
    for (const skillId of skillIds) {
      const skill = this.get(skillId);
      sections.push(`Skill ${skill.skillId}: ${skill.summary}`);
      for (const step of skill.steps) {
        sections.push(`- [${step.kind}] ${step.instruction}`);
      }
      sections.push("Completion checks:");
      for (const check of skill.completionChecks) sections.push(`- ${check}`);
    }
    return sections.join("\n");
  }
}
