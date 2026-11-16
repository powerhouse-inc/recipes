/**
 * Imported first by the demo and the test, so reactor-api's loggers, which
 * copy the root level when its modules load, start at `error`. The refusals
 * the scenarios provoke would otherwise each log a warning.
 */
import { setLogLevel } from "document-model";

setLogLevel("error");
