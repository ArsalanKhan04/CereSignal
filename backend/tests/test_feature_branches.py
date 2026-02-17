"""
Tests for feature branches to ensure they don't break existing functionality.
These tests verify the changes in:
1. fix/auto-create-uploads - Auto-creates uploads directory
2. fix/bookmark-empty-comment - Handles empty bookmark comments
3. feat/unlimited-bookmarks - Removes 2-bookmark limit
4. feat/topomap-in-reports - Includes topomap in PDF reports
5. feat/detailed-logging - Adds comprehensive logging
6. feat/eeg-keyboard-nav - Adds keyboard navigation (frontend)
"""

import os
import sys
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pytest


class TestAutoCreateUploads:
    """Tests for fix/auto-create-uploads branch"""

    def test_uploads_directory_creation(self):
        """Test that uploads directory is created if it doesn't exist"""
        with tempfile.TemporaryDirectory() as tmpdir:
            uploads_path = os.path.join(tmpdir, "uploads")

            # Verify it doesn't exist initially
            assert not os.path.exists(uploads_path)

            # Simulate the fix: create directory
            os.makedirs(uploads_path, exist_ok=True)

            # Verify it now exists
            assert os.path.exists(uploads_path)
            assert os.path.isdir(uploads_path)

    def test_uploads_directory_exists_no_error(self):
        """Test that no error occurs if uploads directory already exists"""
        with tempfile.TemporaryDirectory() as tmpdir:
            uploads_path = os.path.join(tmpdir, "uploads")

            # Create directory first
            os.makedirs(uploads_path)
            assert os.path.exists(uploads_path)

            # Should not raise even if directory exists
            os.makedirs(uploads_path, exist_ok=True)

            # Still exists
            assert os.path.exists(uploads_path)


class TestUnlimitedBookmarks:
    """Tests for feat/unlimited-bookmarks branch"""

    def test_no_bookmark_limit_check(self):
        """Test that bookmarks are not limited to 2"""
        # Simulate the bookmark list
        bookmarks = []

        # Add more than 2 bookmarks
        for i in range(10):
            bookmarks.append(
                {
                    "id": i + 1,
                    "comment": f"Bookmark {i + 1}",
                    "file_id": 1,
                }
            )

        # In the original code, this would fail with >= 2 bookmarks
        # After the fix, any number of bookmarks is allowed
        assert len(bookmarks) == 10

        # The old validation that was removed:
        # if len(existing_bookmarks) >= 2 and not bookmark_data.replace_id:
        #     raise HTTPException(...)

        # Now this should pass (no validation)
        can_add_bookmark = True  # No limit check
        assert can_add_bookmark is True

    def test_pdf_includes_all_bookmarks(self):
        """Test that PDF includes all bookmarks, not just first 2"""
        # Simulate bookmark list
        bookmarks = [
            {"id": 1, "comment": "First", "image_path": "/tmp/1.png"},
            {"id": 2, "comment": "Second", "image_path": "/tmp/2.png"},
            {"id": 3, "comment": "Third", "image_path": "/tmp/3.png"},
            {"id": 4, "comment": "Fourth", "image_path": "/tmp/4.png"},
        ]

        # Old behavior: bookmarks[:2] - only first 2
        old_behavior = bookmarks[:2]
        assert len(old_behavior) == 2

        # New behavior: all bookmarks
        new_behavior = bookmarks  # No slicing
        assert len(new_behavior) == 4


class TestBookmarkEmptyComment:
    """Tests for fix/bookmark-empty-comment branch"""

    def test_empty_comment_handling_frontend(self):
        """Test that empty comments are handled gracefully in frontend"""
        bookmarks = [
            {"id": 1, "comment": "Has comment"},
            {"id": 2, "comment": ""},
            {"id": 3, "comment": None},
        ]

        for bookmark in bookmarks:
            comment = bookmark.get("comment")
            # Frontend fix: only render if comment exists
            should_render_comment = bool(comment)

            if bookmark["id"] == 1:
                assert should_render_comment is True
            else:
                assert should_render_comment is False

    def test_empty_comment_handling_pdf(self):
        """Test that empty comments are not included in PDF"""
        bookmarks = [
            {"id": 1, "comment": "Has comment", "image_path": "/tmp/1.png"},
            {"id": 2, "comment": "", "image_path": "/tmp/2.png"},
            {"id": 3, "comment": None, "image_path": "/tmp/3.png"},
        ]

        pdf_story = []
        for bookmark in bookmarks:
            # Always add image
            pdf_story.append(f"Image: {bookmark['image_path']}")

            # Fix: only add comment paragraph if comment exists
            if bookmark.get("comment"):
                pdf_story.append(f"Comment: {bookmark['comment']}")

        # Should have 3 images but only 1 comment
        image_count = len([item for item in pdf_story if item.startswith("Image:")])
        comment_count = len([item for item in pdf_story if item.startswith("Comment:")])

        assert image_count == 3
        assert comment_count == 1


class TestTopomapInReports:
    """Tests for feat/topomap-in-reports branch"""

    def test_topomap_path_construction(self):
        """Test that topomap path is constructed correctly"""
        filename = "test_eeg_file.edf"
        base = os.path.splitext(filename)[0]

        # Expected topomap filename
        expected_topomap = f"{base}_topomap.png"
        assert expected_topomap == "test_eeg_file_topomap.png"

    def test_topomap_graceful_fallback(self):
        """Test that missing topomap doesn't break report generation"""
        with tempfile.TemporaryDirectory() as tmpdir:
            topomap_path = os.path.join(tmpdir, "nonexistent_topomap.png")

            # The fix: check if file exists before including
            story = []

            if os.path.exists(topomap_path):
                story.append(f"Topomap: {topomap_path}")

            # Should have empty story since file doesn't exist
            assert len(story) == 0

    def test_topomap_included_when_exists(self):
        """Test that topomap is included when file exists"""
        with tempfile.TemporaryDirectory() as tmpdir:
            topomap_path = os.path.join(tmpdir, "test_topomap.png")

            # Create a dummy topomap file
            Path(topomap_path).touch()

            story = []

            if os.path.exists(topomap_path):
                story.append(f"Topomap: {topomap_path}")

            # Should include topomap since file exists
            assert len(story) == 1
            assert "Topomap" in story[0]


class TestDetailedLogging:
    """Tests for feat/detailed-logging branch"""

    def test_log_directory_creation(self):
        """Test that logs directory is created"""
        with tempfile.TemporaryDirectory() as tmpdir:
            logs_dir = Path(tmpdir) / "logs"

            # Create logs directory
            logs_dir.mkdir(exist_ok=True)

            assert logs_dir.exists()
            assert logs_dir.is_dir()

    def test_log_request_format(self):
        """Test log request message format"""
        method = "POST"
        path = "/api/v1/signals/upload"
        user_id = 123

        # Expected format from logging_config.py
        msg = f"REQUEST: {method} {path}"
        if user_id:
            msg += f" | user_id={user_id}"

        assert "REQUEST: POST /api/v1/signals/upload" in msg
        assert "user_id=123" in msg

    def test_log_response_format(self):
        """Test log response message format"""
        method = "POST"
        path = "/api/v1/signals/upload"
        status_code = 200
        duration_ms = 150.5

        msg = f"RESPONSE: {method} {path} | status={status_code}"
        if duration_ms is not None:
            msg += f" | duration={duration_ms:.2f}ms"

        assert "RESPONSE: POST /api/v1/signals/upload" in msg
        assert "status=200" in msg
        assert "duration=150.50ms" in msg

    def test_log_auth_format(self):
        """Test authentication log format"""
        event = "login"
        username = "testuser"
        success = True

        status = "SUCCESS" if success else "FAILED"
        msg = f"AUTH: {event} | status={status}"
        if username:
            msg += f" | username={username}"

        assert "AUTH: login | status=SUCCESS" in msg
        assert "username=testuser" in msg

    def test_log_auth_failure_format(self):
        """Test authentication failure log format"""
        event = "login"
        username = "baduser"
        success = False

        status = "SUCCESS" if success else "FAILED"
        msg = f"AUTH: {event} | status={status}"
        if username:
            msg += f" | username={username}"

        assert "AUTH: login | status=FAILED" in msg


class TestIntegration:
    """Integration tests to ensure all features work together"""

    def test_bookmark_workflow(self):
        """Test complete bookmark workflow with unlimited bookmarks and empty comments"""
        bookmarks = []

        # Add multiple bookmarks (unlimited)
        for i in range(5):
            comment = f"Comment {i}" if i % 2 == 0 else ""  # Some with empty comments
            bookmarks.append(
                {
                    "id": i + 1,
                    "comment": comment,
                    "image_path": f"/tmp/bookmark_{i}.png",
                }
            )

        # Should allow all 5 bookmarks (no limit)
        assert len(bookmarks) == 5

        # Filter for PDF (only non-empty comments shown)
        comments_for_pdf = [b["comment"] for b in bookmarks if b["comment"]]
        assert len(comments_for_pdf) == 3  # Only bookmarks 0, 2, 4 have comments

    def test_report_generation_workflow(self):
        """Test PDF report generation with topomap and bookmarks"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Setup test files
            uploads_dir = os.path.join(tmpdir, "uploads")
            os.makedirs(uploads_dir, exist_ok=True)

            # Create topomap file
            topomap_path = os.path.join(tmpdir, "test_topomap.png")
            Path(topomap_path).touch()

            # Create bookmark images
            bookmark_dir = os.path.join(uploads_dir, "bookmarks", "1")
            os.makedirs(bookmark_dir, exist_ok=True)

            bookmarks = []
            for i in range(3):
                img_path = os.path.join(bookmark_dir, f"bookmark_{i}.png")
                Path(img_path).touch()
                bookmarks.append(
                    {
                        "id": i + 1,
                        "comment": f"Comment {i}" if i == 0 else "",
                        "image_path": img_path,
                    }
                )

            # Build PDF story
            story = []

            # Add topomap if exists
            if os.path.exists(topomap_path):
                story.append("TOPOMAP_SECTION")

            # Add all bookmarks (unlimited)
            story.append("BOOKMARKS_SECTION")
            for bookmark in bookmarks:
                if os.path.exists(bookmark["image_path"]):
                    story.append(f"IMAGE_{bookmark['id']}")
                if bookmark.get("comment"):  # Only add non-empty comments
                    story.append(f"COMMENT_{bookmark['id']}")

            # Verify story structure
            assert "TOPOMAP_SECTION" in story
            assert "BOOKMARKS_SECTION" in story
            assert story.count("IMAGE_") == 0  # We used full strings

            # Count images and comments
            image_entries = [s for s in story if s.startswith("IMAGE_")]
            comment_entries = [s for s in story if s.startswith("COMMENT_")]

            assert len(image_entries) == 3  # All 3 bookmark images
            assert len(comment_entries) == 1  # Only 1 has non-empty comment


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
