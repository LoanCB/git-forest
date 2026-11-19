use super::error::{GitError, GitErrorKind};
use super::runner::{run_git, run_git_allow_codes};
use super::types::*;
use crate::repos::resolve_repo;
use std::collections::HashMap;
use std::path::Path;
use tauri::AppHandle;

const FS: char = '\x1f';
const RS: char = '\x1e';

fn failed(message: impl Into<String>) -> GitError {
    GitError::new(GitErrorKind::Failed, message)
}

/// A value starting with a dash would be read by git as an option.
fn reject_option_like(value: &str) -> Result<(), GitError> {
    if value.starts_with('-') {
        Err(GitError::new(GitErrorKind::InvalidName, value))
    } else {
        Ok(())
    }
}

/// Runs a `-q` git query where exit 1 means "no such thing" (`None`). Any
/// other failure, such as 128 for a broken or missing repository, is an error.
fn run_git_opt(repo: &Path, args: &[&str]) -> Result<Option<String>, GitError> {
    let out = run_git_allow_codes(repo, args, &[0, 1])?;
    Ok((!out.trim().is_empty()).then_some(out))
}

fn head_commit(repo: &Path) -> Result<Option<String>, GitError> {
    Ok(run_git_opt(repo, &["rev-parse", "--verify", "-q", "HEAD"])?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty()))
}

pub fn read_refs(repo: &Path) -> Result<Refs, GitError> {
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(objectname)%1f%(*objectname)%1f%(upstream:short)%1f%(symref)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;
    let mut locals = Vec::new();
    let mut remotes = Vec::new();
    let mut tags = Vec::new();
    // `refs/remotes/<remote>/HEAD` -> full name of the branch it points at.
    let mut origin_heads: HashMap<String, String> = HashMap::new();
    for line in out.lines() {
        let f: Vec<&str> = line.split(FS).collect();
        let [refname, object, peeled, upstream, symref] = f[..] else {
            return Err(failed(format!("unexpected for-each-ref line: {line:?}")));
        };
        if let Some(name) = refname.strip_prefix("refs/heads/") {
            locals.push(LocalBranch {
                name: name.to_string(),
                commit: object.to_string(),
                upstream: (!upstream.is_empty()).then(|| upstream.to_string()),
            });
        } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
            if !symref.is_empty() {
                origin_heads.insert(refname.to_string(), symref.to_string());
                continue;
            }
            let Some((remote, name)) = rest.split_once('/') else {
                continue;
            };
            remotes.push(RemoteBranch {
                remote: remote.to_string(),
                name: name.to_string(),
                commit: object.to_string(),
                is_head: false,
            });
        } else if let Some(name) = refname.strip_prefix("refs/tags/") {
            tags.push(Tag {
                name: name.to_string(),
                commit: if peeled.is_empty() { object } else { peeled }.to_string(),
                annotated: !peeled.is_empty(),
            });
        }
    }
    for target in origin_heads.values() {
        if let Some(r) = remotes
            .iter_mut()
            .find(|r| format!("refs/remotes/{}/{}", r.remote, r.name) == *target)
        {
            r.is_head = true;
        }
    }
    let remote_names = run_git(repo, &["remote"])?
        .lines()
        .map(str::to_string)
        .collect();
    let branch = run_git_opt(repo, &["symbolic-ref", "-q", "--short", "HEAD"])?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok(Refs {
        head: Head {
            branch,
            commit: head_commit(repo)?,
        },
        locals,
        remotes,
        tags,
        remote_names,
    })
}

fn parse_commits(out: &str) -> Result<Vec<Commit>, GitError> {
    out.split(RS)
        .map(|r| r.trim_start_matches('\n'))
        .filter(|r| !r.is_empty())
        .map(|record| {
            let f: Vec<&str> = record.split(FS).collect();
            let [hash, parents, name, email, date, subject] = f[..] else {
                return Err(failed(format!("unexpected log record: {record:?}")));
            };
            Ok(Commit {
                hash: hash.to_string(),
                parents: parents.split_whitespace().map(str::to_string).collect(),
                author_name: name.to_string(),
                author_email: email.to_string(),
                author_date: date.parse().map_err(|_| failed("bad author date"))?,
                subject: subject.to_string(),
            })
        })
        .collect()
}

pub fn read_commits(repo: &Path, q: &LogQuery) -> Result<CommitPage, GitError> {
    let empty = CommitPage {
        commits: Vec::new(),
        has_more: false,
    };
    if head_commit(repo)?.is_none() {
        return Ok(empty);
    }
    let max = format!("--max-count={}", u64::from(q.limit) + 1);
    let skip = format!("--skip={}", q.skip);
    let mut args: Vec<&str> = vec![
        "log",
        // A user's `log.showSignature` would print the check before each record.
        "--no-show-signature",
        "--date-order",
        "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s%x1e",
        &max,
        &skip,
    ];
    match &q.refs {
        None => {
            args.extend(["--branches", "--tags", "HEAD"]);
            if q.include_remotes {
                args.push("--remotes");
            }
        }
        Some(refs) if refs.is_empty() => return Ok(empty),
        Some(refs) => {
            for r in refs {
                reject_option_like(r)?;
                args.push(r);
            }
        }
    }
    // Disambiguates revisions from paths.
    args.push("--");
    let mut commits = parse_commits(&run_git(repo, &args)?)?;
    let has_more = commits.len() > q.limit as usize;
    commits.truncate(q.limit as usize);
    Ok(CommitPage { commits, has_more })
}

/// Parses `--numstat -z` into path -> (additions, deletions); a binary file is
/// `(None, None)`. Renames contribute their new path.
fn parse_numstat(out: &str) -> HashMap<String, (Option<u32>, Option<u32>)> {
    let mut map = HashMap::new();
    let mut tokens = out.split('\0').filter(|t| !t.is_empty());
    while let Some(tok) = tokens.next() {
        let mut parts = tok.splitn(3, '\t');
        let (Some(add), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let path = if path.is_empty() {
            let _old = tokens.next();
            tokens.next().unwrap_or_default()
        } else {
            path
        };
        map.insert(path.to_string(), (add.parse().ok(), del.parse().ok()));
    }
    map
}

fn apply_numstat(files: &mut [FileChange], stats: &HashMap<String, (Option<u32>, Option<u32>)>) {
    for f in files {
        if let Some((a, d)) = stats.get(&f.path) {
            f.additions = *a;
            f.deletions = *d;
        }
    }
}

pub fn read_uncommitted(repo: &Path) -> Result<Vec<FileChange>, GitError> {
    let out = run_git(
        repo,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let mut files = Vec::new();
    let mut entries = out.split('\0').filter(|e| !e.is_empty());
    while let Some(entry) = entries.next() {
        let mut chars = entry.chars();
        let (Some(x), Some(y)) = (chars.next(), chars.next()) else {
            continue;
        };
        let path = entry.get(3..).unwrap_or_default().to_string();
        // A rename or copy entry is followed by its source path.
        let old_path = if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            entries.next().map(str::to_string)
        } else {
            None
        };
        let status = match (x, y) {
            ('?', '?') => '?',
            ('!', '!') => continue,
            (' ', y) => y,
            (x, _) => x,
        };
        // Unmerged entries (U, AA, DD) are reported as modified.
        let status = if status == 'U' { 'M' } else { status };
        files.push(FileChange {
            status: status.to_string(),
            path,
            old_path,
            additions: None,
            deletions: None,
        });
    }
    let numstat = if head_commit(repo)?.is_some() {
        run_git(repo, &["diff", "HEAD", "-M", "--numstat", "-z"])?
    } else {
        run_git(repo, &["diff", "--cached", "-M", "--numstat", "-z"])?
    };
    apply_numstat(&mut files, &parse_numstat(&numstat));
    Ok(files)
}

fn parse_name_status(out: &str) -> Vec<FileChange> {
    let mut files = Vec::new();
    let mut tokens = out.split('\0').filter(|t| !t.is_empty());
    while let Some(code) = tokens.next() {
        let status = code.chars().next().unwrap_or('M').to_string();
        let Some(first) = tokens.next() else { break };
        let (path, old_path) = if matches!(status.as_str(), "R" | "C") {
            (tokens.next().unwrap_or(first), Some(first.to_string()))
        } else {
            (first, None)
        };
        files.push(FileChange {
            status,
            path: path.to_string(),
            old_path,
            additions: None,
            deletions: None,
        });
    }
    files
}

pub fn read_commit_details(repo: &Path, hash: &str) -> Result<CommitDetails, GitError> {
    reject_option_like(hash)?;
    let header = run_git(
        repo,
        &[
            "show",
            "--no-show-signature",
            "-s",
            "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%B",
            hash,
            "--",
        ],
    )?;
    let f: Vec<&str> = header.splitn(9, FS).collect();
    let [full, parents, an, ae, at, cn, ce, ct, message] = f[..] else {
        return Err(failed(format!("unexpected show output: {header:?}")));
    };
    let parents: Vec<String> = parents.split_whitespace().map(str::to_string).collect();
    let parse_date = |d: &str| d.parse::<i64>().map_err(|_| failed("bad date"));
    let mut tree_args = vec!["diff-tree", "-r", "-M", "--no-commit-id", "-z"];
    let base: &str;
    match parents.first() {
        Some(p) => {
            base = p;
            tree_args.push(base);
        }
        None => tree_args.push("--root"),
    }
    tree_args.push(full);
    let mut status_args = tree_args.clone();
    status_args.push("--name-status");
    let mut stat_args = tree_args;
    stat_args.push("--numstat");
    let mut files = parse_name_status(&run_git(repo, &status_args)?);
    apply_numstat(&mut files, &parse_numstat(&run_git(repo, &stat_args)?));
    Ok(CommitDetails {
        hash: full.to_string(),
        parents,
        author_name: an.to_string(),
        author_email: ae.to_string(),
        author_date: parse_date(at)?,
        committer_name: cn.to_string(),
        committer_email: ce.to_string(),
        committer_date: parse_date(ct)?,
        message: message.trim_end().to_string(),
        files,
    })
}

fn null_device() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}

pub fn read_file_diff(
    repo: &Path,
    target: &DiffTarget,
    path: &str,
    old_path: Option<&str>,
) -> Result<String, GitError> {
    let mut paths = vec![path];
    paths.extend(old_path.filter(|o| *o != path));
    // Pathspecs are file names here, never patterns.
    let base = ["--literal-pathspecs", "-c", "core.quotepath=off"];
    let diff_opts = ["--no-color", "--no-ext-diff", "-M"];
    let mut args: Vec<&str> = base.to_vec();
    let parent: String;
    match target {
        DiffTarget::Commit { hash } => {
            reject_option_like(hash)?;
            parent = format!("{hash}^");
            let has_parent =
                run_git_opt(repo, &["rev-parse", "--verify", "-q", &parent])?.is_some();
            if has_parent {
                args.push("diff");
                args.extend(diff_opts);
                args.extend([parent.as_str(), hash.as_str()]);
            } else {
                args.extend(["show", "--no-show-signature", "--format="]);
                args.extend(diff_opts);
                args.push(hash);
            }
        }
        DiffTarget::WorkingTree => {
            let untracked = !run_git(
                repo,
                &[
                    "--literal-pathspecs",
                    "ls-files",
                    "--others",
                    "--exclude-standard",
                    "-z",
                    "--",
                    path,
                ],
            )?
            .is_empty();
            if untracked {
                // Exit code 1 only means "files differ".
                return run_git_allow_codes(
                    repo,
                    &[
                        "diff",
                        "--no-index",
                        "--no-color",
                        "--no-ext-diff",
                        "--",
                        null_device(),
                        path,
                    ],
                    &[0, 1],
                );
            }
            args.push("diff");
            args.extend(diff_opts);
            if head_commit(repo)?.is_some() {
                args.push("HEAD");
            } else {
                args.push("--cached");
            }
        }
    }
    args.push("--");
    args.extend(paths);
    run_git(repo, &args)
}

pub fn read_resolve_commit(repo: &Path, rev: &str) -> Result<Option<String>, GitError> {
    if rev.is_empty() || rev.starts_with('-') {
        return Ok(None);
    }
    let spec = format!("{rev}^{{commit}}");
    Ok(run_git_opt(repo, &["rev-parse", "--verify", "-q", &spec])?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty()))
}

/// Local branches whose tip is reachable from HEAD, without the checked-out
/// one: what `git branch -d` can delete without losing work.
pub fn read_merged_branches(repo: &Path) -> Result<Vec<String>, GitError> {
    if head_commit(repo)?.is_none() {
        return Ok(Vec::new());
    }
    let current = run_git_opt(repo, &["symbolic-ref", "-q", "--short", "HEAD"])?
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let out = run_git(
        repo,
        &[
            "for-each-ref",
            "--merged=HEAD",
            "--format=%(refname:short)",
            "refs/heads/",
        ],
    )?;
    Ok(out
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty() && *name != current)
        .map(str::to_string)
        .collect())
}

#[tauri::command(async)]
pub fn get_refs(app: AppHandle, repo: String) -> Result<Refs, GitError> {
    read_refs(&resolve_repo(&app, &repo)?)
}

#[tauri::command(async)]
pub fn get_commits(app: AppHandle, repo: String, query: LogQuery) -> Result<CommitPage, GitError> {
    read_commits(&resolve_repo(&app, &repo)?, &query)
}

#[tauri::command(async)]
pub fn get_uncommitted(app: AppHandle, repo: String) -> Result<Vec<FileChange>, GitError> {
    read_uncommitted(&resolve_repo(&app, &repo)?)
}

#[tauri::command(async)]
pub fn get_commit_details(
    app: AppHandle,
    repo: String,
    hash: String,
) -> Result<CommitDetails, GitError> {
    read_commit_details(&resolve_repo(&app, &repo)?, &hash)
}

#[tauri::command(async)]
pub fn get_file_diff(
    app: AppHandle,
    repo: String,
    target: DiffTarget,
    path: String,
    old_path: Option<String>,
) -> Result<String, GitError> {
    read_file_diff(
        &resolve_repo(&app, &repo)?,
        &target,
        &path,
        old_path.as_deref(),
    )
}

#[tauri::command(async)]
pub fn resolve_commit(
    app: AppHandle,
    repo: String,
    rev: String,
) -> Result<Option<String>, GitError> {
    read_resolve_commit(&resolve_repo(&app, &repo)?, &rev)
}

#[tauri::command(async)]
pub fn get_merged_branches(app: AppHandle, repo: String) -> Result<Vec<String>, GitError> {
    read_merged_branches(&resolve_repo(&app, &repo)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;
    use std::fs;
    use std::process::Command;

    fn query(refs: Option<Vec<&str>>, skip: u32, limit: u32) -> LogQuery {
        LogQuery {
            refs: refs.map(|r| r.into_iter().map(String::from).collect()),
            include_remotes: false,
            skip,
            limit,
        }
    }

    fn hashes(page: &CommitPage) -> Vec<&str> {
        page.commits.iter().map(|c| c.hash.as_str()).collect()
    }

    #[test]
    fn commits_of_empty_repo_is_empty() {
        let repo = TestRepo::new();
        let page = read_commits(repo.path(), &query(None, 0, 10)).unwrap();
        assert!(page.commits.is_empty());
        assert!(!page.has_more);
    }

    #[test]
    fn commits_of_non_repo_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        // Safe even if the temp dir sits inside some repository: stop discovery.
        let broken = tmp.path().join("broken");
        fs::create_dir(&broken).unwrap();
        fs::create_dir(broken.join(".git")).unwrap();
        assert!(read_commits(&broken, &query(None, 0, 10)).is_err());
    }

    #[test]
    fn refs_of_empty_repo() {
        let repo = TestRepo::new();
        let refs = read_refs(repo.path()).unwrap();
        assert_eq!(refs.head.commit, None);
        assert!(refs.locals.is_empty());
    }

    #[test]
    fn parses_unicode_and_separators() {
        let repo = TestRepo::new();
        repo.git(&["config", "user.name", "Loan Côté"]);
        let h = repo.commit("feat(x): ✨ a|b\tc", &[("a.txt", "a")]);
        let page = read_commits(repo.path(), &query(None, 0, 10)).unwrap();
        let c = &page.commits[0];
        assert_eq!(c.hash, h);
        assert_eq!(c.subject, "feat(x): ✨ a|b\tc");
        assert_eq!(c.author_name, "Loan Côté");
        assert_eq!(c.author_email, "test@example.com");
        assert_eq!(c.author_date, 1_700_000_060);
        assert!(c.parents.is_empty());
    }

    #[test]
    fn commits_are_in_date_order_with_parents() {
        let repo = TestRepo::new();
        let c1 = repo.commit("one", &[("a.txt", "a")]);
        repo.git(&["checkout", "-q", "-b", "feature"]);
        let f = repo.commit("feat", &[("f.txt", "f")]);
        repo.git(&["checkout", "-q", "main"]);
        let m = repo.commit("main", &[("m.txt", "m")]);
        repo.git(&["merge", "-q", "--no-ff", "-m", "merge", "feature"]);
        let merge = repo.git(&["rev-parse", "HEAD"]);
        let page = read_commits(repo.path(), &query(None, 0, 10)).unwrap();
        assert_eq!(
            hashes(&page),
            vec![merge.as_str(), m.as_str(), f.as_str(), c1.as_str()]
        );
        assert_eq!(page.commits[0].parents, vec![m, f]);
    }

    #[test]
    fn paging_with_skip_and_has_more() {
        let repo = TestRepo::new();
        for i in 0..5 {
            repo.commit(&format!("c{i}"), &[("a.txt", &i.to_string())]);
        }
        let page = read_commits(repo.path(), &query(None, 2, 2)).unwrap();
        assert_eq!(page.commits.len(), 2);
        assert_eq!(page.commits[0].subject, "c2");
        assert!(page.has_more);
        let page = read_commits(repo.path(), &query(None, 4, 2)).unwrap();
        assert_eq!(page.commits.len(), 1);
        assert!(!page.has_more);
    }

    #[test]
    fn refs_filter_limits_history() {
        let repo = TestRepo::new();
        let c1 = repo.commit("one", &[("a.txt", "a")]);
        repo.git(&["checkout", "-q", "-b", "feature"]);
        let f = repo.commit("feat", &[("f.txt", "f")]);
        repo.git(&["checkout", "-q", "main"]);
        let m = repo.commit("main only", &[("m.txt", "m")]);
        let page = read_commits(repo.path(), &query(Some(vec!["feature"]), 0, 10)).unwrap();
        assert_eq!(hashes(&page), vec![f.as_str(), c1.as_str()]);
        let all = read_commits(repo.path(), &query(None, 0, 10)).unwrap();
        assert!(hashes(&all).contains(&m.as_str()));
        let bad = read_commits(repo.path(), &query(Some(vec!["--all"]), 0, 10));
        assert!(bad.is_err());
    }

    #[test]
    fn refs_lists_remotes_tags_and_origin_head() {
        let origin = TestRepo::new();
        let c1 = origin.commit("one", &[("a.txt", "a")]);
        origin.git(&["branch", "feat/x"]);
        origin.git(&["tag", "-a", "v1", "-m", "release"]);
        origin.git(&["tag", "light"]);
        let tmp = tempfile::tempdir().unwrap();
        let dest = tmp.path().join("clone");
        let out = Command::new("git")
            .args(["clone", "-q"])
            .arg(origin.path())
            .arg(&dest)
            .env("GIT_CONFIG_GLOBAL", null_device())
            .env("GIT_CONFIG_SYSTEM", null_device())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        let refs = read_refs(&dest).unwrap();
        assert_eq!(refs.head.branch.as_deref(), Some("main"));
        assert_eq!(refs.head.commit.as_deref(), Some(c1.as_str()));
        assert_eq!(refs.remote_names, vec!["origin"]);
        assert_eq!(refs.locals.len(), 1);
        assert_eq!(refs.locals[0].upstream.as_deref(), Some("origin/main"));
        let names: Vec<_> = refs
            .remotes
            .iter()
            .map(|r| (r.name.as_str(), r.is_head))
            .collect();
        assert_eq!(names, vec![("feat/x", false), ("main", true)]);
        assert!(refs
            .remotes
            .iter()
            .all(|r| r.remote == "origin" && r.commit == c1));
        let tag = |n: &str| refs.tags.iter().find(|t| t.name == n).unwrap();
        assert!(tag("v1").annotated);
        assert_eq!(tag("v1").commit, c1);
        assert!(!tag("light").annotated);
        assert_eq!(tag("light").commit, c1);
    }

    #[test]
    fn detached_head_has_no_branch() {
        let repo = TestRepo::new();
        let c1 = repo.commit("one", &[("a.txt", "a")]);
        repo.git(&["checkout", "-q", "--detach"]);
        let refs = read_refs(repo.path()).unwrap();
        assert_eq!(refs.head.branch, None);
        assert_eq!(refs.head.commit, Some(c1));
    }

    fn change<'a>(files: &'a [FileChange], path: &str) -> &'a FileChange {
        files
            .iter()
            .find(|f| f.path == path)
            .unwrap_or_else(|| panic!("{path} in {files:?}"))
    }

    #[test]
    fn uncommitted_lists_modified_added_untracked_renamed() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "line\n"), ("b.txt", "bee\nbee\nbee\n")]);
        fs::write(repo.path().join("a.txt"), "line\nnew\n").unwrap();
        fs::write(repo.path().join("n.txt"), "x\n").unwrap();
        repo.git(&["add", "n.txt"]);
        fs::write(repo.path().join("u.txt"), "u\n").unwrap();
        repo.git(&["mv", "b.txt", "b2.txt"]);
        let files = read_uncommitted(repo.path()).unwrap();
        let a = change(&files, "a.txt");
        assert_eq!(
            (a.status.as_str(), a.additions, a.deletions),
            ("M", Some(1), Some(0))
        );
        let n = change(&files, "n.txt");
        assert_eq!((n.status.as_str(), n.additions), ("A", Some(1)));
        let u = change(&files, "u.txt");
        assert_eq!(
            (u.status.as_str(), u.additions, u.deletions),
            ("?", None, None)
        );
        let r = change(&files, "b2.txt");
        assert_eq!(r.status, "R");
        assert_eq!(r.old_path.as_deref(), Some("b.txt"));
        assert_eq!(files.len(), 4);
    }

    #[test]
    fn details_of_merge_compare_to_first_parent() {
        let repo = TestRepo::new();
        repo.commit("one", &[("a.txt", "a")]);
        repo.git(&["checkout", "-q", "-b", "feature"]);
        repo.commit("feat", &[("f.txt", "f\n")]);
        repo.git(&["checkout", "-q", "main"]);
        repo.commit("main", &[("m.txt", "m")]);
        repo.git(&[
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "merge\n\nbody line",
            "feature",
        ]);
        let hash = repo.git(&["rev-parse", "HEAD"]);
        let d = read_commit_details(repo.path(), &hash).unwrap();
        assert_eq!(d.parents.len(), 2);
        assert_eq!(d.message, "merge\n\nbody line");
        assert_eq!(d.committer_name, "Test");
        assert_eq!(d.files.len(), 1);
        assert_eq!(d.files[0].path, "f.txt");
        assert_eq!(d.files[0].status, "A");
        assert_eq!(d.files[0].additions, Some(1));
    }

    #[test]
    fn details_of_root_commit_lists_all_files() {
        let repo = TestRepo::new();
        let hash = repo.commit("root", &[("a.txt", "a\n"), ("d/b.txt", "b\nb\n")]);
        let d = read_commit_details(repo.path(), &hash).unwrap();
        assert!(d.parents.is_empty());
        assert_eq!(d.files.len(), 2);
        assert_eq!(change(&d.files, "d/b.txt").additions, Some(2));
    }

    #[test]
    fn file_diff_of_commit_and_working_tree() {
        let repo = TestRepo::new();
        let root = repo.commit("one", &[("a.txt", "ligne\n")]);
        let second = repo.commit("two", &[("a.txt", "ligne\nnouvelle ligne\n")]);
        let target = DiffTarget::Commit { hash: second };
        let diff = read_file_diff(repo.path(), &target, "a.txt", None).unwrap();
        assert!(diff.contains("+nouvelle ligne"), "{diff}");
        let target = DiffTarget::Commit { hash: root };
        let diff = read_file_diff(repo.path(), &target, "a.txt", None).unwrap();
        assert!(diff.contains("+ligne"), "{diff}");
        fs::write(repo.path().join("a.txt"), "ligne\nnouvelle ligne\nencore\n").unwrap();
        let diff = read_file_diff(repo.path(), &DiffTarget::WorkingTree, "a.txt", None).unwrap();
        assert!(diff.contains("+encore"), "{diff}");
        fs::write(repo.path().join("u.txt"), "tout\nnouveau\n").unwrap();
        let diff = read_file_diff(repo.path(), &DiffTarget::WorkingTree, "u.txt", None).unwrap();
        assert!(
            diff.contains("+tout") && diff.contains("+nouveau"),
            "{diff}"
        );
    }

    #[test]
    fn resolve_commit_short_hash_and_unknown() {
        let repo = TestRepo::new();
        let hash = repo.commit("one", &[("a.txt", "a")]);
        let found = read_resolve_commit(repo.path(), &hash[..7]).unwrap();
        assert_eq!(found, Some(hash));
        assert_eq!(
            read_resolve_commit(repo.path(), "deadbeefdead").unwrap(),
            None
        );
        assert_eq!(read_resolve_commit(repo.path(), "--all").unwrap(), None);
    }

    /// `log.showSignature=true` makes `log` and `show` print the signature
    /// check on stdout, before each record, unless told not to.
    #[test]
    fn signed_commits_parse_with_log_show_signature() {
        let repo = TestRepo::new();
        let key = repo.path().join(".git/test-signing-key");
        let keygen = Command::new("ssh-keygen")
            .args(["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f"])
            .arg(&key)
            .stdin(std::process::Stdio::null())
            .output();
        if !keygen.is_ok_and(|o| o.status.success()) {
            eprintln!("ssh-keygen unavailable: skipping");
            return;
        }
        repo.git(&["config", "gpg.format", "ssh"]);
        repo.git(&["config", "user.signingkey", key.to_str().unwrap()]);
        repo.git(&["config", "log.showSignature", "true"]);
        fs::write(repo.path().join("a.txt"), "ligne\n").unwrap();
        repo.git(&["add", "-A"]);
        repo.git(&["commit", "-q", "-S", "-m", "signed root"]);
        let root = repo.git(&["rev-parse", "HEAD"]);
        fs::write(repo.path().join("a.txt"), "ligne\nsuite\n").unwrap();
        repo.git(&["commit", "-q", "-S", "-am", "signed child"]);
        let child = repo.git(&["rev-parse", "HEAD"]);

        let page = read_commits(repo.path(), &query(None, 0, 10)).unwrap();
        assert_eq!(hashes(&page), [child.as_str(), root.as_str()]);
        assert_eq!(page.commits[1].parents, Vec::<String>::new());

        let d = read_commit_details(repo.path(), &child).unwrap();
        assert_eq!(d.hash, child);
        assert_eq!(d.parents, std::slice::from_ref(&root));

        let target = DiffTarget::Commit { hash: root };
        let diff = read_file_diff(repo.path(), &target, "a.txt", None).unwrap();
        assert!(diff.starts_with("diff --git"), "{diff}");
    }

    #[test]
    fn merged_branches_skip_the_current_and_unmerged_ones() {
        let repo = TestRepo::new();
        repo.commit("c1", &[("a.txt", "a")]);
        repo.git(&["branch", "done"]);
        repo.git(&["checkout", "-q", "-b", "wip"]);
        repo.commit("c2", &[("b.txt", "b")]);
        repo.git(&["checkout", "-q", "-"]);
        let current = repo.git(&["symbolic-ref", "--short", "HEAD"]);
        let merged = read_merged_branches(repo.path()).unwrap();
        assert_eq!(merged, vec!["done".to_string()], "current: {current}");
    }

    #[test]
    fn merged_branches_of_an_empty_repo_is_empty() {
        let repo = TestRepo::new();
        assert!(read_merged_branches(repo.path()).unwrap().is_empty());
    }
}
