use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub last_opened: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DrawingFile {
    pub version: u32,
    pub name: String,
    pub store: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Get the app data directory for storing recent files list
fn get_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))
}

/// Get the recent files JSON path
fn get_recent_files_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = get_app_data_dir(app)?;
    // Ensure directory exists
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create app data directory: {}", e))?;
    path.push("recent_files.json");
    Ok(path)
}

/// Save a drawing file to disk
#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(())
}

/// Read a drawing file from disk
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Get the list of recent files
#[tauri::command]
async fn get_recent_files(app: tauri::AppHandle) -> Result<Vec<RecentFile>, String> {
    let path = get_recent_files_path(&app)?;
    
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read recent files: {}", e))?;
    
    let files: Vec<RecentFile> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse recent files: {}", e))?;
    
    Ok(files)
}

/// Add a file to the recent files list
#[tauri::command]
async fn add_recent_file(app: tauri::AppHandle, path: String, name: String) -> Result<(), String> {
    let recent_path = get_recent_files_path(&app)?;
    
    let mut files: Vec<RecentFile> = if recent_path.exists() {
        let content = fs::read_to_string(&recent_path)
            .map_err(|e| format!("Failed to read recent files: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };
    
    // Remove if already exists
    files.retain(|f| f.path != path);
    
    // Add to front
    files.insert(0, RecentFile {
        path,
        name,
        last_opened: chrono_timestamp(),
    });
    
    // Keep only last 20
    files.truncate(20);
    
    // Save
    let content = serde_json::to_string_pretty(&files)
        .map_err(|e| format!("Failed to serialize recent files: {}", e))?;
    fs::write(&recent_path, content)
        .map_err(|e| format!("Failed to save recent files: {}", e))?;
    
    Ok(())
}

/// Remove a file from recent files list
#[tauri::command]
async fn remove_recent_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let recent_path = get_recent_files_path(&app)?;
    
    if !recent_path.exists() {
        return Ok(());
    }
    
    let content = fs::read_to_string(&recent_path)
        .map_err(|e| format!("Failed to read recent files: {}", e))?;
    
    let mut files: Vec<RecentFile> = serde_json::from_str(&content)
        .unwrap_or_else(|_| Vec::new());
    
    files.retain(|f| f.path != path);
    
    let content = serde_json::to_string_pretty(&files)
        .map_err(|e| format!("Failed to serialize recent files: {}", e))?;
    fs::write(&recent_path, content)
        .map_err(|e| format!("Failed to save recent files: {}", e))?;
    
    Ok(())
}

/// Clear all recent files
#[tauri::command]
async fn clear_recent_files(app: tauri::AppHandle) -> Result<(), String> {
    let recent_path = get_recent_files_path(&app)?;
    
    if recent_path.exists() {
        fs::remove_file(&recent_path)
            .map_err(|e| format!("Failed to clear recent files: {}", e))?;
    }
    
    Ok(())
}

/// Check if a file exists
#[tauri::command]
async fn file_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

/// Get a simple timestamp (seconds since epoch)
fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Export canvas as PNG image bytes
#[tauri::command]
async fn export_to_png(svg_data: String, width: u32, height: u32) -> Result<Vec<u8>, String> {
    // For PNG export, we'll use resvg to render SVG to PNG
    let opt = usvg::Options::default();
    let tree = usvg::Tree::from_str(&svg_data, &opt)
        .map_err(|e| format!("Failed to parse SVG: {}", e))?;
    
    let pixmap_size = tree.size().to_int_size();
    let mut pixmap = tiny_skia::Pixmap::new(
        if width > 0 { width } else { pixmap_size.width() },
        if height > 0 { height } else { pixmap_size.height() }
    ).ok_or("Failed to create pixmap")?;
    
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    
    let png_data = pixmap.encode_png()
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    
    Ok(png_data)
}

/// Save PNG to file
#[tauri::command]
async fn save_png(path: String, svg_data: String, width: u32, height: u32) -> Result<(), String> {
    let png_data = export_to_png(svg_data, width, height).await?;
    fs::write(&path, &png_data).map_err(|e| format!("Failed to save PNG: {}", e))?;
    Ok(())
}

/// Save SVG to file  
#[tauri::command]
async fn save_svg(path: String, svg_data: String) -> Result<(), String> {
    fs::write(&path, &svg_data).map_err(|e| format!("Failed to save SVG: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            save_file,
            read_file,
            get_recent_files,
            add_recent_file,
            remove_recent_file,
            clear_recent_files,
            file_exists,
            export_to_png,
            save_png,
            save_svg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
