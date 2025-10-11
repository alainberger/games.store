// Android adapter stub for TF-Lite / MediaPipe implementation.
// TODO: Replace with actual Kotlin/Java bridge hooking into StrongBox-backed keystore.

export interface AndroidFaceSDKOptions {
  tenantId?: string;
  region?: string;
}

export class AndroidFaceSDK {
  constructor(private options: AndroidFaceSDKOptions = {}) {
    // TODO: warm-up TF-Lite interpreters + device binding with StrongBox if available.
  }

  async enroll(_: any) {
    throw new Error('TODO: invoke native enroll via TF-Lite pipeline');
  }

  async verify(_: any) {
    throw new Error('TODO: invoke native verify via TF-Lite pipeline');
  }

  async identify(_: any) {
    throw new Error('TODO: invoke native identify via TF-Lite pipeline');
  }

  async recheckLiveness(_: any) {
    throw new Error('TODO: invoke native recheckLiveness via TF-Lite pipeline');
  }
}
