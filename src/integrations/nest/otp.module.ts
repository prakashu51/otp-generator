import { Module } from "@nestjs/common";
import type { DynamicModule, ModuleMetadata, Provider } from "@nestjs/common";

import { OTPManager } from "../../core/otp.service.js";
import type { OTPManagerOptions } from "../../core/otp.types.js";

export const OTP_MANAGER_OPTIONS = Symbol("OTP_MANAGER_OPTIONS");

export interface OTPModuleOptions extends OTPManagerOptions {
  isGlobal?: boolean;
}

export interface OTPModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  inject?: Array<string | symbol | Function>;
  isGlobal?: boolean;
  useFactory: (...args: any[]) => Promise<OTPManagerOptions> | OTPManagerOptions;
}

@Module({})
export class OTPModule {
  static forRoot(options: OTPModuleOptions): DynamicModule {
    const managerProvider = createManagerProvider(options);

    return {
      module: OTPModule,
      global: options.isGlobal ?? false,
      providers: [managerProvider],
      exports: [OTPManager],
    };
  }

  static forRootAsync(options: OTPModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: OTP_MANAGER_OPTIONS,
      inject: options.inject ?? [],
      useFactory: options.useFactory,
    };

    const managerProvider: Provider = {
      provide: OTPManager,
      inject: [OTP_MANAGER_OPTIONS],
      useFactory: (resolvedOptions: OTPManagerOptions) => new OTPManager(resolvedOptions),
    };

    return {
      module: OTPModule,
      global: options.isGlobal ?? false,
      imports: options.imports ?? [],
      providers: [optionsProvider, managerProvider],
      exports: [OTPManager],
    };
  }
}

function createManagerProvider(options: OTPManagerOptions): Provider<OTPManager> {
  return {
    provide: OTPManager,
    useValue: new OTPManager(options),
  };
}
