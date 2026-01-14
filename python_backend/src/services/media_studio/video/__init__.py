"""
Video Processing Module
Professional video editing services powered by FFmpeg
"""

from .core import (
    VideoProbeResult,
    get_ffmpeg_path,
    get_ffprobe_path,
    download_video,
    probe_video,
    create_temp_dir,
    cleanup_temp_dir,
    VIDEO_PLATFORM_PRESETS,
    MAX_MERGE_DURATION_SECONDS,
)
from .merger import VideoMerger, VideoMergeResult
from .transitions import TransitionService, TransitionType
from .text_overlay import TextOverlayService, TextOverlayResult

__all__ = [
    # Core
    "VideoProbeResult",
    "get_ffmpeg_path",
    "get_ffprobe_path",
    "download_video",
    "probe_video",
    "create_temp_dir",
    "cleanup_temp_dir",
    "VIDEO_PLATFORM_PRESETS",
    "MAX_MERGE_DURATION_SECONDS",
    # Merger
    "VideoMerger",
    "VideoMergeResult",
    # Transitions
    "TransitionService",
    "TransitionType",
    # Text Overlay
    "TextOverlayService",
    "TextOverlayResult",
]
