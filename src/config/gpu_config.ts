/**
 * GPU Configuration for Local Training
 *
 * Configuration for using local GPUs (CUDA, ROCm, Metal, etc.) for accelerated training.
 * This provides a foundation for future neural network-based evaluators.
 *
 * Current implementation uses CPU-based linear evaluators, but this module
 * prepares for GPU acceleration when migrating to deep learning models.
 */

/**
 * Supported GPU backends
 */
export enum GPUBackend {
  /** NVIDIA CUDA (Linux, Windows) */
  CUDA = 'cuda',

  /** AMD ROCm (Linux) */
  ROCM = 'rocm',

  /** Apple Metal (macOS) */
  METAL = 'metal',

  /** CPU fallback (no GPU) */
  CPU = 'cpu',
}

/**
 * GPU configuration
 */
export interface GPUConfig {
  /** GPU backend to use */
  backend: GPUBackend;

  /** Device ID (for multi-GPU systems) */
  deviceId: number;

  /** Enable mixed precision training (FP16) */
  mixedPrecision: boolean;

  /** Batch size for parallel training */
  batchSize: number;

  /** Number of worker threads for data loading */
  numWorkers: number;

  /** Pin memory for faster GPU transfer */
  pinMemory: boolean;

  /** Enable GPU memory growth (avoid pre-allocation) */
  allowMemoryGrowth: boolean;

  /** Maximum GPU memory fraction to use (0-1) */
  memoryFraction: number;
}

/**
 * Default GPU configuration
 */
export const DEFAULT_GPU_CONFIG: GPUConfig = {
  backend: GPUBackend.CPU, // Default to CPU for compatibility
  deviceId: 0,
  mixedPrecision: false,
  batchSize: 32,
  numWorkers: 4,
  pinMemory: true,
  allowMemoryGrowth: true,
  memoryFraction: 0.8, // Use up to 80% of GPU memory
};

/**
 * Detect available GPU backend
 */
export function detectGPUBackend(): GPUBackend {
  // This is a placeholder - actual detection would require native bindings
  // or checking for CUDA/ROCm/Metal availability

  const platform = process.platform;

  // Check environment variables for hints
  if (process.env.CUDA_VISIBLE_DEVICES !== undefined) {
    return GPUBackend.CUDA;
  }

  if (process.env.ROCR_VISIBLE_DEVICES !== undefined) {
    return GPUBackend.ROCM;
  }

  // Platform-specific defaults
  if (platform === 'darwin') {
    // macOS - assume Metal availability
    return GPUBackend.METAL;
  }

  // Default to CPU
  return GPUBackend.CPU;
}

/**
 * GPU device information
 */
export interface GPUDeviceInfo {
  deviceId: number;
  name: string;
  totalMemory: number; // bytes
  availableMemory: number; // bytes
  computeCapability?: string;
  backend: GPUBackend;
}

/**
 * Get available GPU devices (placeholder)
 */
export function getAvailableGPUDevices(): GPUDeviceInfo[] {
  // This is a placeholder - actual implementation would require native bindings
  // to CUDA, ROCm, or Metal APIs

  const backend = detectGPUBackend();

  if (backend === GPUBackend.CPU) {
    return [];
  }

  // Placeholder device info
  return [
    {
      deviceId: 0,
      name: `${backend.toUpperCase()} Device 0`,
      totalMemory: 8 * 1024 * 1024 * 1024, // 8 GB
      availableMemory: 6 * 1024 * 1024 * 1024, // 6 GB
      backend,
    },
  ];
}

/**
 * Initialize GPU context
 */
export function initializeGPU(config: Partial<GPUConfig> = {}): {
  success: boolean;
  backend: GPUBackend;
  message: string;
} {
  const finalConfig = { ...DEFAULT_GPU_CONFIG, ...config };

  // Auto-detect if backend is not specified
  if (!config.backend) {
    finalConfig.backend = detectGPUBackend();
  }

  // For now, always succeed with CPU backend
  // Future implementations will actually initialize GPU libraries

  if (finalConfig.backend === GPUBackend.CPU) {
    return {
      success: true,
      backend: GPUBackend.CPU,
      message: 'Using CPU backend (no GPU acceleration)',
    };
  }

  // Placeholder for GPU initialization
  console.log(`GPU Configuration:
  Backend: ${finalConfig.backend}
  Device ID: ${finalConfig.deviceId}
  Mixed Precision: ${finalConfig.mixedPrecision}
  Batch Size: ${finalConfig.batchSize}
  Memory Fraction: ${finalConfig.memoryFraction}
  `);

  return {
    success: true,
    backend: finalConfig.backend,
    message: `Initialized ${finalConfig.backend.toUpperCase()} backend on device ${finalConfig.deviceId}`,
  };
}

/**
 * Environment variable configuration
 */
export function loadGPUConfigFromEnv(): Partial<GPUConfig> {
  const config: Partial<GPUConfig> = {};

  // Backend
  const backendEnv = process.env.TETRIS_AI_GPU_BACKEND;
  if (backendEnv && Object.values(GPUBackend).includes(backendEnv as GPUBackend)) {
    config.backend = backendEnv as GPUBackend;
  }

  // Device ID
  const deviceIdEnv = process.env.TETRIS_AI_GPU_DEVICE_ID;
  if (deviceIdEnv) {
    const deviceId = parseInt(deviceIdEnv, 10);
    if (!isNaN(deviceId)) {
      config.deviceId = deviceId;
    }
  }

  // Mixed precision
  const mixedPrecisionEnv = process.env.TETRIS_AI_GPU_MIXED_PRECISION;
  if (mixedPrecisionEnv) {
    config.mixedPrecision = mixedPrecisionEnv.toLowerCase() === 'true';
  }

  // Batch size
  const batchSizeEnv = process.env.TETRIS_AI_GPU_BATCH_SIZE;
  if (batchSizeEnv) {
    const batchSize = parseInt(batchSizeEnv, 10);
    if (!isNaN(batchSize) && batchSize > 0) {
      config.batchSize = batchSize;
    }
  }

  // Memory fraction
  const memoryFractionEnv = process.env.TETRIS_AI_GPU_MEMORY_FRACTION;
  if (memoryFractionEnv) {
    const memoryFraction = parseFloat(memoryFractionEnv);
    if (!isNaN(memoryFraction) && memoryFraction > 0 && memoryFraction <= 1) {
      config.memoryFraction = memoryFraction;
    }
  }

  return config;
}

/**
 * Get recommended configuration for current system
 */
export function getRecommendedGPUConfig(): GPUConfig {
  const backend = detectGPUBackend();
  const envConfig = loadGPUConfigFromEnv();

  const recommended: GPUConfig = {
    ...DEFAULT_GPU_CONFIG,
    backend,
    ...envConfig,
  };

  // Adjust batch size based on backend
  if (backend === GPUBackend.CPU) {
    recommended.batchSize = 16; // Smaller batches for CPU
    recommended.numWorkers = Math.min(4, require('os').cpus().length);
  } else {
    recommended.batchSize = 64; // Larger batches for GPU
  }

  return recommended;
}

/**
 * GPU training statistics
 */
export interface GPUTrainingStats {
  backend: GPUBackend;
  deviceId: number;
  memoryUsed: number; // bytes
  memoryTotal: number; // bytes
  utilizationPercent: number; // 0-100
  throughput: number; // episodes per second
}

/**
 * Get GPU training statistics (placeholder)
 */
export function getGPUTrainingStats(): GPUTrainingStats | null {
  // This is a placeholder - actual implementation would query GPU APIs

  const backend = detectGPUBackend();

  if (backend === GPUBackend.CPU) {
    return null;
  }

  return {
    backend,
    deviceId: 0,
    memoryUsed: 2 * 1024 * 1024 * 1024, // 2 GB
    memoryTotal: 8 * 1024 * 1024 * 1024, // 8 GB
    utilizationPercent: 75,
    throughput: 10.5, // episodes/sec
  };
}
