import type { SysmlCommit, SysmlElement, SysmlProject } from "./types.js";

/**
 * Boundary interface for a SysML v2 model repository.
 *
 * The production implementation is an HTTP client for an OMG Systems Modeling
 * API & Services endpoint. The fixture implementation serves committed JSON
 * snapshots so the digital-thread kernel can be exercised hermetically.
 */
export interface SysmlModelService {
  getProject(projectId: string): Promise<SysmlProject>;
  listCommits(projectId: string): Promise<SysmlCommit[]>;
  listElements(projectId: string, commitId: string): Promise<SysmlElement[]>;
  getElement(
    projectId: string,
    commitId: string,
    elementId: string,
  ): Promise<SysmlElement | undefined>;
  ownedElements(
    projectId: string,
    commitId: string,
    ownerElementId: string,
  ): Promise<SysmlElement[]>;
}
