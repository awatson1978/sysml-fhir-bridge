import { readFileSync } from "node:fs";
import type { SysmlCommit, SysmlElement, SysmlProject } from "./types.js";
import type { SysmlModelService } from "./service.js";

export interface SysmlModelFixture {
  project: SysmlProject;
  commits: {
    commit: SysmlCommit;
    /** Full element snapshot at this commit. */
    elements: SysmlElement[];
  }[];
}

/** Fixture-backed SysmlModelService for tests, demos and offline operation. */
export class FixtureSysmlService implements SysmlModelService {
  constructor(private readonly fixture: SysmlModelFixture) {}

  static fromFile(path: string): FixtureSysmlService {
    const fixture = JSON.parse(readFileSync(path, "utf8")) as SysmlModelFixture;
    return new FixtureSysmlService(fixture);
  }

  async getProject(projectId: string): Promise<SysmlProject> {
    if (this.fixture.project.projectId !== projectId) {
      throw new Error(`Unknown SysML project: ${projectId}`);
    }
    return this.fixture.project;
  }

  async listCommits(projectId: string): Promise<SysmlCommit[]> {
    await this.getProject(projectId);
    return this.fixture.commits.map((c) => c.commit);
  }

  async listElements(projectId: string, commitId: string): Promise<SysmlElement[]> {
    await this.getProject(projectId);
    const snapshot = this.fixture.commits.find((c) => c.commit.commitId === commitId);
    if (!snapshot) throw new Error(`Unknown SysML commit: ${commitId}`);
    return snapshot.elements;
  }

  async getElement(
    projectId: string,
    commitId: string,
    elementId: string,
  ): Promise<SysmlElement | undefined> {
    const elements = await this.listElements(projectId, commitId);
    return elements.find((e) => e.elementId === elementId);
  }

  async ownedElements(
    projectId: string,
    commitId: string,
    ownerElementId: string,
  ): Promise<SysmlElement[]> {
    const elements = await this.listElements(projectId, commitId);
    return elements.filter((e) => e.ownerId === ownerElementId);
  }
}
