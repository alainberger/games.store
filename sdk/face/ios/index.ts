// iOS adapter stub for native Core ML pipeline.
// TODO: Replace with actual bridge to Core ML face detection + embedding + liveness models.

export interface NativeFaceSDKOptions {
  tenantId?: string;
  region?: string;
}

export class IOSFaceSDK {
  constructor(private options: NativeFaceSDKOptions = {}) {
    // TODO: initialize Secure Enclave binding + local model warmup.
  }

  async enroll(_: any) {
    throw new Error('TODO: call native enroll(userSeed, embedding) implemented in Swift/Objective-C');
  }

  async verify(_: any) {
    throw new Error('TODO: call native verify(userSeed, embedding) implemented in Swift/Objective-C');
  }

  async identify(_: any) {
    throw new Error('TODO: call native identify(userSeed, embedding) implemented in Swift/Objective-C');
  }

  async recheckLiveness(_: any) {
    throw new Error('TODO: call native recheckLiveness(blink, yaw) implemented in Swift/Objective-C');
  }
}
