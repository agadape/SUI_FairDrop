import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Constant 30fps, no stutter — see Rekap doc smoothness notes.
Config.setConcurrency(null); // auto
