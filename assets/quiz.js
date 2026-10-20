/* ==========================================================================
   Vocabulary Review — generic viewer (no content in here)

   Content lives in books/<book>/<chapter>.json, described by the generated
   manifest books/index.json.

     http(s)  — GitHub Pages, `npm run serve`, any static host:
                reads the manifest, then only the chapter files you selected.
     file://  — double-clicking index.html: browsers cannot fetch local files,
                so the generated books/bundle.js is loaded instead.

   URL contract
     index.html                     -> last selection, or the first chapter
     index.html#book=spylark        -> first chapter of that book
     index.html#ch=spylark/01       -> one chapter
     index.html#ch=spylark/01,spylark/02,other-book/prologue -> combined sheet
     index.html#ch=1                -> legacy form, first book's chapter "1"
   ========================================================================== */

(function () {
    'use strict';

    var STORE_KEY = 'spylark.selection';
    var MANIFEST_FILE = 'books/index.json';
    var BUNDLE_FILE = 'books/bundle.js';

    var served = /^https?:$/.test(location.protocol);
    var NARROW = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null;

    var el = {
        sidebar: document.getElementById('sidebar'),
        sidebarMain: document.querySelector('.sidebar-main'),
        bookList: document.getElementById('book-list'),
        toggle: document.getElementById('sidebar-toggle'),
        toggleLabel: document.getElementById('sidebar-toggle-label'),
        backdrop: document.getElementById('sidebar-backdrop'),
        title: document.getElementById('page-title'),
        meta: document.getElementById('page-meta'),
        intro: document.getElementById('page-intro'),
        reviewList: document.getElementById('review-list'),
        quizList: document.getElementById('quiz-list'),
        answerKey: document.getElementById('answer-key'),
        dataNote: document.getElementById('data-note'),
        empty: document.getElementById('empty-state'),
        countA: document.getElementById('count-a'),
        countB: document.getElementById('count-b'),
        countC: document.getElementById('count-c')
    };

    var state = {
        manifest: { books: [] },
        keys: [],        // ["spylark/01", ...]
        open: {},        // bookId -> expanded?
        source: ''
    };

    /* ---------------------------------------------------------------- text */

    function esc(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function attr(value) {
        return esc(value).replace(/"/g, '&quot;');
    }

    function closest(node, selector) {
        return node && node.nodeType === 1 && node.closest ? node.closest(selector) : null;
    }

    function unique(list) {
        return list.filter(function (item, index) { return item && list.indexOf(item) === index; });
    }

    /* ---------------------------------------------------------- data access */

    function store() {
        if (!window.SPYLARK_DATA) {
            window.SPYLARK_DATA = {};
        }
        return window.SPYLARK_DATA;
    }

    function allBooks() {
        return (state.manifest.books || []).slice().sort(function (a, b) {
            return (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title));
        });
    }

    function bookById(id) {
        var list = state.manifest.books || [];
        for (var i = 0; i < list.length; i += 1) {
            if (list[i].id === id) {
                return list[i];
            }
        }
        return null;
    }

    function chapterEntry(bookId, chapterId) {
        var book = bookById(bookId);
        if (!book) {
            return null;
        }
        for (var i = 0; i < book.chapters.length; i += 1) {
            if (book.chapters[i].id === chapterId) {
                return book.chapters[i];
            }
        }
        return null;
    }

    function keyOf(bookId, chapterId) {
        return bookId + '/' + chapterId;
    }

    function parseKey(key) {
        var at = String(key).indexOf('/');
        if (at <= 0) {
            return null;
        }
        return { book: key.slice(0, at), chapter: key.slice(at + 1) };
    }

    function chapterData(bookId, chapterId) {
        var key = keyOf(bookId, chapterId);
        var data = store();
        if (data[key]) {
            return Promise.resolve(data[key]);
        }

        var entry = chapterEntry(bookId, chapterId);
        if (!entry || !served) {
            return Promise.reject(new Error('"' + key + '" is not loaded'));
        }

        return fetch(entry.file, { cache: 'no-cache' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(entry.file + ' returned HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (chapter) {
                store()[key] = chapter;
                return chapter;
            });
    }

    function loadManifest() {
        if (window.SPYLARK_MANIFEST && window.SPYLARK_MANIFEST.books) {
            state.source = 'bundle';
            return Promise.resolve(window.SPYLARK_MANIFEST);
        }
        if (!served) {
            return Promise.reject(new Error('the bundle ' + BUNDLE_FILE + ' did not load'));
        }
        state.source = 'fetch';
        return fetch(MANIFEST_FILE, { cache: 'no-cache' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(MANIFEST_FILE + ' returned HTTP ' + response.status);
                }
                return response.json();
            });
    }

    /* ------------------------------------------------------------ selection */

    function hashParams() {
        var raw = String(location.hash || '').replace(/^#/, '');
        var params = {};
        raw.split('&').forEach(function (pair) {
            var at = pair.indexOf('=');
            if (at > 0) {
                try {
                    params[decodeURIComponent(pair.slice(0, at))] = decodeURIComponent(pair.slice(at + 1));
                } catch (error) {
                    params[pair.slice(0, at)] = pair.slice(at + 1);
                }
            }
        });
        return params;
    }

    // "spylark/01" -> kept; legacy "01" -> first book that has chapter 01
    function normaliseToken(token) {
        if (token.indexOf('/') > 0) {
            var pair = parseKey(token);
            return pair && chapterEntry(pair.book, pair.chapter) ? token : null;
        }
        var books = allBooks();
        for (var i = 0; i < books.length; i += 1) {
            for (var j = 0; j < books[i].chapters.length; j += 1) {
                if (books[i].chapters[j].id === token) {
                    return keyOf(books[i].id, token);
                }
            }
        }
        return null;
    }

    function orderKeys(keys) {
        var order = {};
        allBooks().forEach(function (book, bookIndex) {
            book.chapters.forEach(function (chapter, chapterIndex) {
                // the manifest is already sorted by book order then chapter order
                order[keyOf(book.id, chapter.id)] = [bookIndex, chapterIndex];
            });
        });
        return keys.slice().sort(function (a, b) {
            var oa = order[a] || [99, 99];
            var ob = order[b] || [99, 99];
            return oa[0] - ob[0] || oa[1] - ob[1] || a.localeCompare(b);
        });
    }

    function storedSelection() {
        try {
            var saved = localStorage.getItem(STORE_KEY);
            if (saved === null) {
                return null;                       // never picked anything yet
            }
            if (saved === '') {
                return [];                         // deliberately cleared everything
            }
            return saved.split(',').filter(Boolean);
        } catch (error) {
            return null;
        }
    }

    function firstChapterOf(book) {
        return book && book.chapters.length ? keyOf(book.id, book.chapters[0].id) : null;
    }

    function resolveSelection() {
        var params = hashParams();

        // "#ch=" (empty) is a deliberate "nothing selected"; a non-empty but
        // stale "#ch=..." falls through to the stored/default selection.
        if (params.ch !== undefined) {
            var keys = unique(params.ch.split(/[,+]/).map(function (token) {
                return normaliseToken(token.trim());
            }).filter(Boolean));
            if (keys.length) {
                return orderKeys(keys);
            }
            if (params.ch.trim() === '') {
                return [];
            }
        }

        if (params.book) {
            var book = bookById(params.book);
            var first = firstChapterOf(book);
            if (first) {
                return [first];
            }
        }

        var saved = storedSelection();
        if (saved !== null) {
            return orderKeys(saved.filter(function (key) {
                var pair = parseKey(key);
                return pair && chapterEntry(pair.book, pair.chapter);
            }));
        }

        var start = firstChapterOf(allBooks()[0]);
        return start ? [start] : [];
    }

    function commitSelection(keys) {
        state.keys = keys;
        var hash = '#ch=' + keys.join(',');

        if (location.hash !== hash) {
            try {
                history.replaceState(null, '', hash);
            } catch (error) {
                location.hash = hash;
            }
        }

        try {
            localStorage.setItem(STORE_KEY, keys.join(','));
        } catch (error) {
            /* private mode: selection still works in memory */
        }
    }

    /* ------------------------------------------------------------- records */

    function records() {
        var data = store();
        return state.keys.map(function (key) {
            var pair = parseKey(key);
            var book = pair && bookById(pair.book);
            var entry = pair && chapterEntry(pair.book, pair.chapter);
            var chapter = data[key];
            if (!book || !entry || !chapter) {
                return null;
            }
            return { key: key, book: book, entry: entry, data: chapter };
        }).filter(Boolean);
    }

    function chapterShort(entry) {
        var match = /^Chapter\s+(\d+)$/i.exec(entry.title || '');
        return match ? 'Ch ' + match[1] : (entry.title || entry.id);
    }

    function joinNums(numbers) {
        if (numbers.length === 1) {
            return String(numbers[0]);
        }
        if (numbers.length === 2) {
            return numbers[0] + ' & ' + numbers[1];
        }
        return numbers.slice(0, -1).join(', ') + ' & ' + numbers[numbers.length - 1];
    }

    // [1,2,3,5,7,8] -> ["1\u20133", "5", "7\u20138"]
    function numberRanges(numbers) {
        var sorted = numbers.slice().sort(function (a, b) { return a - b; });
        var ranges = [];
        sorted.forEach(function (number) {
            var last = ranges[ranges.length - 1];
            if (last && number === last[1] + 1) {
                last[1] = number;
            } else {
                ranges.push([number, number]);
            }
        });
        return ranges.map(function (range) {
            return range[0] === range[1] ? String(range[0]) : range[0] + '\u2013' + range[1];
        });
    }

    // "Chapters 1\u201340 & Acknowledgements" — ranges keep 40-chapter sheets sane.
    function chapterSummary(list) {
        var numbers = [];
        var others = [];
        list.forEach(function (record) {
            var match = /^Chapter\s+(\d+)$/i.exec(record.entry.title || '');
            if (match) {
                numbers.push(Number(match[1]));
            } else {
                others.push(record.entry.title || record.entry.id);
            }
        });

        var parts = [];
        if (numbers.length === 1) {
            parts.push('Chapter ' + numbers[0]);
        } else if (numbers.length) {
            parts.push('Chapters ' + joinNums(numberRanges(numbers)));
        }
        others.forEach(function (title) { parts.push(title); });
        return parts.join(' & ');
    }

    function booksOf(list) {
        var seen = {};
        return list.map(function (record) { return record.book; }).filter(function (book) {
            if (seen[book.id]) {
                return false;
            }
            seen[book.id] = true;
            return true;
        });
    }

    function headingFor(list) {
        var books = booksOf(list);
        if (list.length === 1) {
            return books[0].title + ' \u2014 ' + list[0].entry.title + ' Vocabulary Review Material';
        }
        if (books.length === 1) {
            return books[0].title + ' \u2014 ' + chapterSummary(list) + ' Vocabulary Review';
        }
        return books.map(function (book) { return book.title; }).join(' & ') +
            ' \u2014 ' + list.length + ' chapters Vocabulary Review';
    }

    /* ------------------------------------------------------------- sidebars */

    function renderBookList() {
        el.bookList.innerHTML = allBooks().map(function (book) {
            var selected = book.chapters.filter(function (chapter) {
                return state.keys.indexOf(keyOf(book.id, chapter.id)) !== -1;
            }).length;
            var open = !!state.open[book.id];

            var chapters = book.chapters.map(function (chapter) {
                var key = keyOf(book.id, chapter.id);
                var on = state.keys.indexOf(key) !== -1;
                return '<label class="chapter-option' + (on ? ' is-on' : '') + '">' +
                    '<input type="checkbox" data-chapter-key="' + attr(key) + '"' + (on ? ' checked' : '') + '>' +
                    '<span class="chapter-chip">' +
                    '<span class="chapter-name">' + esc(chapter.title) + '</span>' +
                    '<span class="chapter-count">' + (chapter.words || 0) + ' words &middot; ' +
                    (chapter.quiz || 0) + ' questions</span>' +
                    '</span>' +
                    '</label>';
            }).join('');

            return '<section class="book' + (open ? ' is-open' : '') + '" data-book="' + attr(book.id) + '">' +
                '<button type="button" class="book-head" aria-expanded="' + open + '" data-book-toggle="' + attr(book.id) + '">' +
                '<span class="book-caret" aria-hidden="true">\u25b8</span>' +
                '<span class="book-name">' + esc(book.title) + '</span>' +
                '<span class="book-count">' + (selected ? selected + '/' + book.chapters.length : book.chapters.length + ' ch.') + '</span>' +
                '</button>' +
                '<div class="book-chapters">' + chapters +
                '<div class="book-actions">' +
                '<button type="button" class="mini" data-book-all="' + attr(book.id) + '">select all</button>' +
                '<button type="button" class="mini" data-book-none="' + attr(book.id) + '">clear</button>' +
                '</div>' +
                '</div>' +
                '</section>';
        }).join('');

        updateBookListFade();
    }

    // Fade the bottom edge of the chapter pane while it still has content below,
    // so it is obvious the list scrolls on its own.
    function updateBookListFade() {
        if (!el.sidebarMain || !el.bookList) {
            return;
        }
        var list = el.bookList;
        var overflowing = list.scrollHeight - list.clientHeight > 1;
        var atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
        el.sidebarMain.classList.toggle('is-scrollable', overflowing && !atBottom);
    }

    // A book unfolds whenever it has a ticked chapter (used on load and on
    // #ch=… navigation, so a shared link shows its chapters straight away).
    function syncOpenState() {
        allBooks().forEach(function (book) {
            state.open[book.id] = book.chapters.some(function (chapter) {
                return state.keys.indexOf(keyOf(book.id, chapter.id)) !== -1;
            });
        });
    }

    function setNavLabel(list) {
        if (!el.toggleLabel) {
            return;
        }
        if (!list.length) {
            el.toggleLabel.textContent = 'Chapters';
            return;
        }
        var text = list.length === 1 ? list[0].entry.title : list.length + ' chapters';
        if (list.length === 1 && allBooks().length > 1) {
            text = list[0].book.title + ' \u00b7 ' + text;
        }
        el.toggleLabel.textContent = text;
        if (el.toggle) {
            el.toggle.title = booksOf(list).map(function (book) { return book.title; }).join(' & ') +
                ' \u2014 ' + text;
        }
    }

    /* ------------------------------------------------------------- rendering */

    // "rʌsɪt", "/ˈrʌsɪt/", "[ˈrʌsɪt]" -> "/ˈrʌsɪt/"; missing/blank -> ""
    function ipaOf(entry) {
        var raw = entry && entry.ipa;
        if (typeof raw !== 'string') {
            return '';
        }
        var core = raw.trim()
            .replace(/^[/[]+/, '')
            .replace(/[/\]]+$/, '')
            .trim();
        return core ? '/' + core + '/' : '';
    }

    // Optional Chinese translation / explanation, revealed by a per-word button.
    function transOf(entry) {
        var raw = entry && entry.trans;
        if (typeof raw !== 'string' || raw.trim() === '') {
            return '';
        }
        return raw.trim();
    }

    function badge(record, show, multiBook) {
        if (!show) {
            return '';
        }
        var label = multiBook
            ? record.book.title + ' \u00b7 ' + chapterShort(record.entry)
            : chapterShort(record.entry);
        return '<span class="chapter-badge">' + esc(label) + '</span>';
    }

    function render() {
        var list = records();

        if (!list.length) {
            document.title = 'Vocabulary Review';
            setNavLabel([]);
            showNothingSelected();
            return;
        }

        showSections();

        var multi = list.length > 1;
        var multiBook = booksOf(list).length > 1;
        var words = [];
        var quiz = [];

        list.forEach(function (record) {
            (record.data.words || []).forEach(function (item) {
                words.push({ entry: item, record: record });
            });
            (record.data.quiz || []).forEach(function (item) {
                quiz.push({ entry: item, record: record });
            });
        });

        el.title.textContent = headingFor(list);
        document.title = el.title.textContent;
        el.meta.textContent = words.length + ' review words \u00b7 ' + quiz.length +
            ' fill-in-the-blank questions \u00b7 full answer key';
        el.intro.innerHTML = introFor(list);
        el.intro.hidden = false;

        el.reviewList.innerHTML = words.map(function (item, index) {
            var entry = item.entry;
            var examples = (entry.examples || []).map(function (example) {
                return '<span class="example">' + esc(example) + '</span>';
            }).join('');
            var ipa = ipaOf(entry);
            var trans = transOf(entry);
            var transId = 'word-trans-' + index;
            var transToggle = trans
                ? '<button type="button" class="trans-toggle" data-trans-toggle aria-expanded="false"' +
                  ' aria-controls="' + transId + '" title="Show / hide the translation">\u8bd1</button>'
                : '';
            var transBody = trans
                ? '<span class="trans" id="' + transId + '" hidden>' + esc(trans) + '</span>'
                : '';
            return '<li>' + badge(item.record, multi, multiBook) +
                '<span class="word">' + esc(entry.word) + '</span>' +
                (ipa ? '<span class="ipa" lang="en-fonipa">' + esc(ipa) + '</span>' : '') +
                transToggle + transBody + examples + '</li>';
        }).join('');

        el.quizList.innerHTML = quiz.map(function (item, index) {
            var entry = item.entry;
            var parts = String(entry.prompt || '').split('{}');
            var before = parts.shift();
            var after = parts.join('{}');
            var answer = String(entry.answer);
            var size = Math.min(34, Math.max(9, answer.length + 1));

            return '<div class="quiz-item">' +
                '<p class="quiz-text">' + badge(item.record, multi, multiBook) + (index + 1) + '. ' + esc(before) +
                '<input class="blank" type="text" size="' + size + '" data-answer="' + attr(answer) + '"' +
                ' autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next">' +
                esc(after) + '</p>' +
                '<span class="chinese-hint" data-answer="' + attr(answer) + '">(中文提示: ' +
                esc(entry.hint) + ')</span>' +
                '</div>';
        }).join('');

        el.answerKey.innerHTML = quiz.map(function (item, index) {
            var entry = item.entry;
            return '<li>' + badge(item.record, multi, multiBook) +
                '<span class="answer-num">' + (index + 1) + '.</span> ' +
                esc(entry.key || entry.answer) + '</li>';
        }).join('');

        el.countA.textContent = words.length + ' words';
        el.countB.textContent = quiz.length + ' questions';
        el.countC.textContent = quiz.length + ' answers';

        setNavLabel(list);
        updateFilled();
    }

    function introFor(list) {
        if (list.length === 1 && list[0].data.intro) {
            return list[0].data.intro;
        }
        var books = booksOf(list);
        var from;
        if (books.length > 1) {
            from = list.length + ' chapter' + (list.length === 1 ? '' : 's') + ' from ' +
                books.map(function (book) { return book.title; }).join(' & ');
        } else if (list.length === 1) {
            from = list[0].entry.title;
        } else {
            from = chapterSummary(list);
        }

        return '<strong>💡 Learning Guide:</strong> This review material is designed to reinforce your vocabulary from ' +
            esc(from) + '. In <strong>Part B (Quiz)</strong>, type your answer into each dashed blank and press ' +
            '<strong>Check answers</strong> to see how you did. Need a nudge? ' +
            '<strong>Hover the Chinese hint</strong> under any sentence to peek at the answer, or press ' +
            '<strong>Show answers</strong> to fill them all in.';
    }

    function showSections() {
        el.empty.hidden = true;
        el.empty.innerHTML = '';
        ['top', 'part-a', 'part-b', 'part-c'].forEach(function (id) {
            var section = document.getElementById(id);
            if (section) {
                section.hidden = false;
            }
        });
    }

    function datasetNote() {
        return '<p>Content lives in <code>books/&lt;book&gt;/*.json</code>. After adding or editing a dataset, run ' +
            '<code>npm run data</code> (or double-click <code>tools/rebuild-data.cmd</code>). ' +
            'It validates the JSON and regenerates <code>books/index.json</code> and <code>books/bundle.js</code>.</p>' +
            '<p>Opened from disk (<code>file://</code>) the page needs the generated bundle; ' +
            'served over http(s) it reads the JSON files directly.</p>';
    }

    function showEmpty(message, extraHtml) {
        showPanel('Nothing to show yet', '<p>' + esc(message) + '</p>' +
            (extraHtml === undefined ? datasetNote() : extraHtml));
    }

    // Zero chapters is a legal selection: explain how to pick one instead of
    // silently showing the first chapter again.
    function showNothingSelected() {
        showPanel('No chapter is selected',
            '<p>Nothing is ticked right now, so there is no material to show. Tick one or more chapters in the ' +
            'sidebar (<strong>Books &amp; chapters</strong>) — the review list, quiz and answer key are built from ' +
            'exactly what is ticked.</p>' +
            '<p>The selection is kept in the URL as <code>#ch=…</code> and remembered in this browser, so a ' +
            'combined sheet can be bookmarked or shared. <strong>select all</strong> under a book picks a whole ' +
            'book at once.</p>');
    }

    function showPanel(title, bodyHtml) {
        hideSections();
        el.empty.hidden = false;
        el.empty.innerHTML = '<h2>' + esc(title) + '</h2>' + bodyHtml;

        if (el.countA) {
            el.countA.textContent = 'Review list';
        }
        if (el.countB) {
            el.countB.textContent = 'Quiz';
        }
        if (el.countC) {
            el.countC.textContent = 'Answer key';
        }
    }

    function hideSections() {
        ['top', 'part-a', 'part-b', 'part-c'].forEach(function (id) {
            var section = document.getElementById(id);
            if (section) {
                section.hidden = true;
            }
        });
    }

    /* -------------------------------------------------------------- loading */

    function refresh() {
        if (el.meta) {
            el.meta.textContent = 'Loading\u2026';
        }

        var pending = state.keys.map(function (key) {
            var pair = parseKey(key);
            return pair ? chapterData(pair.book, pair.chapter) : Promise.reject(new Error('bad key ' + key));
        });

        return Promise.all(pending)
            .then(function () {
                render();
            })
            .catch(function (error) {
                showEmpty('Could not load a dataset (' + (error && error.message) + ').');
            });
    }

    function start() {
        return loadManifest()
            .then(function (manifest) {
                state.manifest = manifest;
                if (!allBooks().length) {
                    showEmpty('No books are defined yet.');
                    return null;
                }
                state.keys = resolveSelection();
                syncOpenState();
                renderBookList();
                setDataNote();
                observeSections();
                return refresh();
            })
            .catch(function (error) {
                showEmpty('Could not load the book list (' + (error && error.message) + ').');
            });
    }

    function setDataNote() {
        if (!el.dataNote) {
            return;
        }
        var when = state.manifest.generatedAt
            ? new Date(state.manifest.generatedAt).toLocaleString()
            : 'unknown';
        var books = allBooks();
        var chapters = books.reduce(function (sum, book) { return sum + book.chapters.length; }, 0);
        el.dataNote.innerHTML = books.length + ' book' + (books.length === 1 ? '' : 's') + ' \u00b7 ' +
            chapters + ' chapter' + (chapters === 1 ? '' : 's') + ' \u00b7 built ' + esc(when) + '<br>' +
            (state.source === 'bundle' ? 'from the bundle' : 'reading JSON live') +
            ' \u00b7 rebuild: <code>npm run data</code>';
    }

    /* ------------------------------------------------------------------ quiz */

    function blanks() {
        return Array.prototype.slice.call(document.querySelectorAll('.blank'));
    }

    function progressEl() {
        return document.querySelector('[data-quiz-progress]');
    }

    function normalize(value) {
        return String(value)
            .toLowerCase()
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\s+/g, ' ')
            .replace(/^[\s.,;:!?'"`]+/, '')
            .replace(/[\s.,;:!?'"`]+$/, '');
    }

    function setState(blank, nextState) {
        blank.classList.remove('is-correct', 'is-wrong', 'is-empty', 'is-revealed');
        if (nextState) {
            blank.classList.add(nextState);
        }
        if (nextState === 'is-wrong') {
            blank.setAttribute('aria-invalid', 'true');
        } else {
            blank.removeAttribute('aria-invalid');
        }
    }

    function updateFilled() {
        var progress = progressEl();
        if (!progress) {
            return;
        }
        var all = blanks();
        var filled = all.filter(function (blank) { return blank.value.trim() !== ''; }).length;
        progress.textContent = filled + ' / ' + all.length + ' filled';
        progress.classList.remove('is-good', 'is-bad');
    }

    function checkAnswers() {
        var all = blanks();
        var correct = 0;
        var empty = 0;

        all.forEach(function (blank) {
            var value = blank.value.trim();
            if (value === '') {
                empty += 1;
                setState(blank, 'is-empty');
                return;
            }
            if (normalize(value) === normalize(blank.getAttribute('data-answer') || '')) {
                correct += 1;
                setState(blank, 'is-correct');
            } else {
                setState(blank, 'is-wrong');
            }
        });

        var progress = progressEl();
        if (!progress) {
            return;
        }
        progress.textContent = 'Score: ' + correct + ' / ' + all.length +
            (empty ? ' \u00b7 ' + empty + ' left blank' : '');
        progress.classList.toggle('is-good', correct === all.length);
        progress.classList.toggle('is-bad', correct !== all.length);
    }

    function showAnswers() {
        blanks().forEach(function (blank) {
            blank.value = blank.getAttribute('data-answer') || '';
            setState(blank, 'is-revealed');
        });
        var progress = progressEl();
        if (progress) {
            progress.textContent = 'All answers shown';
            progress.classList.remove('is-good', 'is-bad');
        }
    }

    function clearAnswers() {
        blanks().forEach(function (blank) {
            blank.value = '';
            setState(blank, null);
        });
        updateFilled();
        var first = blanks()[0];
        if (first) {
            first.focus({ preventScroll: true });
        }
    }

    /* ------------------------------------------------------------ navigation */

    function scrollToSection(id) {
        if (id === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        var target = document.getElementById(id);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function observeSections() {
        var links = {};
        Array.prototype.forEach.call(document.querySelectorAll('.sidebar-link[data-scroll^="part-"]'), function (link) {
            links[link.getAttribute('data-scroll')] = link;
        });

        var sections = Object.keys(links)
            .map(function (id) { return document.getElementById(id); })
            .filter(Boolean);

        if (!sections.length || !('IntersectionObserver' in window)) {
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }
                Object.keys(links).forEach(function (id) { links[id].classList.remove('is-active'); });
                links[entry.target.id].classList.add('is-active');
            });
        }, { rootMargin: '-45% 0px -50% 0px' });

        sections.forEach(function (section) { observer.observe(section); });
    }

    function scrollTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------------------------------------------------------------- drawer */

    function navOpen(open) {
        document.body.classList.toggle('nav-open', open);
        if (el.toggle) {
            el.toggle.setAttribute('aria-expanded', String(open));
        }
        if (el.backdrop) {
            el.backdrop.hidden = !open;
        }
    }

    function navIsOpen() {
        return document.body.classList.contains('nav-open');
    }

    function closeNavOnNarrow() {
        if (NARROW && NARROW.matches) {
            navOpen(false);
        }
    }

    /* ---------------------------------------------------------------- events */

    document.addEventListener('click', function (event) {
        var toggle = closest(event.target, '[data-book-toggle]');
        if (toggle) {
            var bookId = toggle.getAttribute('data-book-toggle');
            state.open[bookId] = !state.open[bookId];
            var section = el.bookList.querySelector('.book[data-book="' + bookId.replace(/"/g, '\\"') + '"]');
            if (section) {
                section.classList.toggle('is-open', !!state.open[bookId]);
            }
            toggle.setAttribute('aria-expanded', String(!!state.open[bookId]));
            updateBookListFade();
            return;
        }

        var all = closest(event.target, '[data-book-all]');
        if (all) {
            toggleBookSelection(all.getAttribute('data-book-all'), true);
            return;
        }

        var none = closest(event.target, '[data-book-none]');
        if (none) {
            toggleBookSelection(none.getAttribute('data-book-none'), false);
            return;
        }

        var action = closest(event.target, '[data-quiz-action]');
        if (action) {
            switch (action.getAttribute('data-quiz-action')) {
                case 'check': checkAnswers(); break;
                case 'show': showAnswers(); break;
                case 'clear': clearAnswers(); break;
                case 'print': window.print(); break;
            }
            return;
        }

        var transToggle = closest(event.target, '[data-trans-toggle]');
        if (transToggle) {
            var body = document.getElementById(transToggle.getAttribute('aria-controls') || '');
            if (body) {
                body.hidden = !body.hidden;
            }
            transToggle.setAttribute('aria-expanded', String(body ? !body.hidden : false));
            return;
        }

        var hint = closest(event.target, '.chinese-hint');
        if (hint) {
            hint.classList.toggle('is-open');
            return;
        }

        var jump = closest(event.target, '[data-scroll]');
        if (jump) {
            event.preventDefault();
            scrollToSection(jump.getAttribute('data-scroll'));
            closeNavOnNarrow();
            return;
        }

        if (closest(event.target, '#sidebar-toggle')) {
            navOpen(!navIsOpen());
            return;
        }

        if (closest(event.target, '#sidebar-backdrop')) {
            navOpen(false);
        }
    });

    document.addEventListener('change', function (event) {
        var box = closest(event.target, '.chapter-option input[type="checkbox"]');
        if (!box) {
            return;
        }

        var keys = Array.prototype.slice.call(document.querySelectorAll('.chapter-option input:checked'))
            .map(function (input) { return input.getAttribute('data-chapter-key'); });

        var label = box.closest('.chapter-option');
        if (label) {
            label.classList.toggle('is-on', box.checked);
        }

        // Zero chapters is a legal state: the page then explains how to pick one.
        commitSelection(orderKeys(keys));
        var toggled = parseKey(box.getAttribute('data-chapter-key') || '');
        if (toggled) {
            updateBookBadge(toggled.book);
        }
        refresh().then(function () {
            scrollTop();
            closeNavOnNarrow();
        });
    });

    function updateBookBadge(bookId) {
        var book = bookId && bookById(bookId);
        var section = book ? el.bookList.querySelector('.book[data-book="' + bookId + '"]') : null;
        var count = section ? section.querySelector('.book-count') : null;
        if (!book || !count) {
            return;
        }
        var selected = book.chapters.filter(function (chapter) {
            return state.keys.indexOf(keyOf(book.id, chapter.id)) !== -1;
        }).length;
        count.textContent = selected ? selected + '/' + book.chapters.length : book.chapters.length + ' ch.';
    }

    function toggleBookSelection(bookId, select) {
        var book = bookById(bookId);
        if (!book) {
            return;
        }
        var prefix = bookId + '/';
        var kept = state.keys.filter(function (key) { return key.indexOf(prefix) !== 0; });
        var keys = select
            ? kept.concat(book.chapters.map(function (chapter) { return keyOf(book.id, chapter.id); }))
            : kept;

        commitSelection(orderKeys(keys));
        renderBookList();
        refresh();
    }

    document.addEventListener('input', function (event) {
        var blank = closest(event.target, '.blank');
        if (!blank) {
            return;
        }
        setState(blank, null);
        updateFilled();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && navIsOpen()) {
            navOpen(false);
            return;
        }

        var blank = closest(event.target, '.blank');
        if (!blank || event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        var all = blanks();
        var next = all[all.indexOf(blank) + 1];
        if (next) {
            next.focus();
            next.select();
        } else {
            blank.blur();
        }
    });

    window.addEventListener('hashchange', function () {
        var keys = resolveSelection();
        if (keys.join(',') === state.keys.join(',')) {
            return;
        }
        state.keys = keys;
        syncOpenState();
        renderBookList();
        refresh();
    });

    window.addEventListener('resize', updateBookListFade);

    if (el.bookList) {
        el.bookList.addEventListener('scroll', updateBookListFade, { passive: true });
    }

    /* ------------------------------------------------------------------ boot */

    function boot() {
        if (window.SPYLARK_MANIFEST) {
            start();                                  // bundle already present (file://)
        } else if (served) {
            start();                                  // fetch the manifest
        } else {
            var script = document.createElement('script');
            script.src = BUNDLE_FILE;
            script.onload = start;
            script.onerror = function () {
                showEmpty('The data bundle ' + BUNDLE_FILE + ' could not be loaded.');
            };
            document.head.appendChild(script);
        }
    }

    boot();
})();
