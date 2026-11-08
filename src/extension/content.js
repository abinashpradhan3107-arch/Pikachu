// Cortex LMS Content Script
// Runs on iitj-learn.masaischool.com
// Detects courses, lectures, assignments and syncs to backend

// Wait for page to load
document.addEventListener('DOMContentLoaded', async () => {
  // Check user is logged into LMS
  const userLoggedIn = await checkUserLogin();
  if (!userLoggedIn) {
    console.log('User not logged into LMS');
    return;
  }

  // Send course data to background script
  try {
    const courseData = await extractCourseData();
    if (courseData && courseData.courseId) {
      chrome.runtime.sendMessage({
        type: 'course-data',
        data: courseData,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('Error extracting course data:', err);
  }

  // Also listen for navigation events
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    chrome.runtime.sendMessage({ type: 'navigation' });
    return result;
  };
});

/**
 * Check if user is logged into the LMS
 */
async function checkUserLogin() {
  // Look for various indicators that user is logged in
  const userIndicators = [
    document.querySelector('[data-user-id]'),
    document.querySelector('.user-profile'),
    document.querySelector('.logged-in'),
    document.querySelector('.navbar-user'),
    document.querySelector('#user-menu')
  ];
  return userIndicators.some(el => el !== null);
}

/**
 * Extract all available course data from the LMS page
 * Handles dynamically rendered React/TanStack pages
 */
async function extractCourseData() {
  const data = {
    courseId: null,
    courseTitle: null,
    chapters: [],
    lectures: [],
    assignments: [],
    announcements: [],
    lastUpdated: new Date().toISOString()
  };

  // Strategy 1: Look for course data in the page header/hero section
  // Check data attributes that might be present on course cards or headers
  const courseHeaders = document.querySelectorAll('[data-course-id], [data-course-title]');
  
  if (courseHeaders.length > 0) {
    courseHeaders.forEach(el => {
      const courseId = el.dataset.courseId;
      const courseTitle = el.dataset.courseTitle;
      
      if (courseId && !data.courseId) {
        data.courseId = courseId;
      }
      if (courseTitle && !data.courseTitle) {
        data.courseTitle = courseTitle;
      }
    });
  }

  // Strategy 2: Look for breadcrumbs which often show course title
  const breadcrumb = document.querySelector('.breadcrumb, .nav-breadcrumb, [role="navigation"] nav');
  if (breadcrumb) {
    const links = breadcrumb.querySelectorAll('a');
    if (links.length > 0) {
      const lastLink = links[links.length - 1];
      const title = lastLink.innerText.trim() || lastLink.dataset.title;
      if (title && title.length > 3 && !data.courseTitle) {
        data.courseTitle = title;
      }
    }
  }

  // Strategy 3: Look for chapter elements - support multiple data attribute patterns
  const chapterSelectors = [
    '[data-chapter]',
    '[data-chapter-id]',
    '[data-chapter-title]',
    '.chapter-item',
    '.module-unit'
  ];

  for (const selector of chapterSelectors) {
    const chapterElements = document.querySelectorAll(selector);
    if (chapterElements.length > 0) {
      chapterElements.forEach(el => {
        const chapterId = el.dataset.chapter || el.dataset.chapterId;
        const chapterTitle = el.dataset.chapterTitle || 
          el.querySelector('h3, h4, .chapter-title, .unit-title')?.innerText.trim() ||
          el.innerText.trim().substring(0, 50) || 'Chapter';
        const chapterOrder = el.dataset.chapterOrder || 
          el.dataset.order || 
          data.chapters.length;

        if (chapterId) {
          data.chapters.push({
            id: chapterId,
            title: chapterTitle,
            order: typeof chapterOrder === 'number' ? chapterOrder : data.chapters.length
          });
        }
      });
      // Only process first matching set to avoid duplicates
      break;
    }
  }

  // Strategy 4: Look for lecture elements
  const lectureSelectors = [
    '[data-lecture]',
    '[data-lecture-id]',
    '[data-lecture-title]',
    '.lecture-item',
    '.lecture-entry',
    '.course-lecture'
  ];

  for (const selector of lectureSelectors) {
    const lectureElements = document.querySelectorAll(selector);
    if (lectureElements.length > 0) {
      lectureElements.forEach(el => {
        const lectureId = el.dataset.lecture || el.dataset.lectureId || `lec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const lectureTitle = el.dataset.lectureTitle ||
          el.querySelector('h3, h4, .lecture-title, .course-lecture-title')?.innerText.trim() ||
          el.innerText.trim().substring(0, 80) || 'Lecture';
        const chapterId = el.dataset.chapterId || el.dataset.chapter || data.chapters[0]?.id || '';
        const duration = el.dataset.duration || el.dataset.durationMin || '0';
        const videoUrl = el.dataset.lectureUrl || el.dataset.videoUrl || el.href || '#';

        data.lectures.push({
          id: lectureId,
          title: lectureTitle,
          chapterId: chapterId,
          duration: duration,
          url: videoUrl
        });
      });
      break;
    }
  }

  // Strategy 5: Look for assignment elements
  const assignmentSelectors = [
    '[data-assignment]',
    '[data-assignment-id]',
    '[data-assignment-title]',
    '.assignment-item',
    '.task-item',
    '.deadline-item'
  ];

  for (const selector of assignmentSelectors) {
    const assignmentElements = document.querySelectorAll(selector);
    if (assignmentElements.length > 0) {
      assignmentElements.forEach(el => {
        const assignmentId = el.dataset.assignment || el.dataset.assignmentId || `assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const assignmentTitle = el.dataset.assignmentTitle ||
          el.querySelector('h3, h4, .assignment-title, .task-title')?.innerText.trim() ||
          el.innerText.trim().substring(0, 60) || 'Assignment';
        const dueDate = el.dataset.dueDate || el.dataset.due || null;
        const status = el.dataset.status || el.dataset.state || 'pending';

        data.assignments.push({
          id: assignmentId,
          title: assignmentTitle,
          dueDate: dueDate,
          status: status
        });
      });
      break;
    }
  }

  // Strategy 6: Look for announcement elements
  const announcementSelectors = [
    '[data-announcement]',
    '[data-announcement-title]',
    '.announcement',
    '.notice',
    '.update'
  ];

  for (const selector of announcementSelectors) {
    const announcementElements = document.querySelectorAll(selector);
    if (announcementElements.length > 0) {
      announcementElements.forEach(el => {
        const announcementId = el.dataset.announcement || el.dataset.announcementId || `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const announcementTitle = el.dataset.announcementTitle ||
          el.querySelector('h3, h4, .announcement-title')?.innerText.trim() ||
          el.innerText.trim().substring(0, 100) || 'Announcement';
        const announcementContent = el.dataset.announcementContent ||
          el.innerText.trim().substring(0, 500) || '';

        data.announcements.push({
          id: announcementId,
          title: announcementTitle,
          content: announcementContent
        });
      });
      break;
    }
  }

  // Strategy 7: Look for course code from URL
  // Common patterns: /course/, /classes/, /program/, etc.
  try {
    const pathname = window.location.pathname;
    const urlCourseMatch = pathname.match(/\/([a-zA-Z0-9_-]+)\/?$/);
    if (urlCourseMatch && !data.courseTitle) {
      data.courseTitle = urlCourseMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  } catch {
    // Ignore URL parsing errors
  }

  // Mark as valid if we found meaningful data
  const hasMeaningfulData = data.courseTitle || data.chapters.length > 0 || data.lectures.length > 0;
  return hasMeaningfulData ? data : null;
}