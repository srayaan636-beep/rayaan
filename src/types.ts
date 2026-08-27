export interface BuildConfig {
  appName: string;
  version: string;
  pythonVersion: string;
  nodeVersion: string;
  electronVersion: string;
  architecture: 'x64' | 'ia32' | 'both';
  createReleaseOnTag: boolean;
  artifactRetentionDays: number;
  outputExeName: string;
}

export interface StepItem {
  id: number;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  badge?: string;
}

export interface ProjectFile {
  path: string;
  name: string;
  description: string;
  required: boolean;
  content: string;
}
