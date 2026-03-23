import type { PlaybackState, Track } from "../types";

function mergePreservedTrack(previousTrack: Track, queueHead: Track): Track {
  return {
    ...previousTrack,
    ...queueHead,
    // The newest queue/state metadata must win so radio tracks stay anonymous.
    requestedBy: queueHead.requestedBy,
    queueOrigin: queueHead.queueOrigin,
    radioGenerated: queueHead.radioGenerated,
  };
}

export function mergePlaybackStateDuringTrackTransition(
  incomingState: PlaybackState,
  previousState: PlaybackState,
): PlaybackState {
  const previousTrack = previousState.currentTrack;
  const queueHead = incomingState.queue[0] ?? null;
  const shouldHandleTransitionPlaceholder =
    incomingState.currentTrack === null && queueHead !== null;

  if (!shouldHandleTransitionPlaceholder || !queueHead) {
    return incomingState;
  }

  const canSafelyMergeCurrentTrack =
    previousTrack !== null && queueHead.videoId === previousTrack.videoId;

  if (!canSafelyMergeCurrentTrack || !previousTrack) {
    return {
      ...incomingState,
      currentTrack: queueHead,
      position: 0,
      duration:
        incomingState.duration > 0 ? incomingState.duration : queueHead.duration,
    };
  }

  return {
    ...incomingState,
    currentTrack: mergePreservedTrack(previousTrack, queueHead),
    position:
      incomingState.position > 0 ? incomingState.position : previousState.position,
    duration:
      incomingState.duration > 0
        ? incomingState.duration
        : previousState.duration || queueHead.duration,
  };
}
