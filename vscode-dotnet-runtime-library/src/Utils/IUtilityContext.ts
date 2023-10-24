import { IWindowDisplayWorker } from "../EventStream/IWindowDisplayWorker";
import { IVSCodeEnvironment } from "./IVSCodeEnvironment";

export interface IUtilityContext {
    ui : IWindowDisplayWorker;
    vsCodeEnv : IVSCodeEnvironment;
}
