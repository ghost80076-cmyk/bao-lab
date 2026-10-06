# Rollback

If the install experience causes production issues, remove the three PWA activation tags from `index.html`. Existing installed copies will still be ordinary web-app shells and continue to load the network site; bumping the service-worker cache name on a later release can invalidate the old shell cache.
