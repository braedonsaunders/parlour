#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    apply_linux_webkit_workarounds();
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Parlour");
}

fn apply_linux_webkit_workarounds() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK's DMA-BUF compositor UD2s on NVIDIA, Hyprland, and
        // GPU-less VMs. See tauri-apps/tauri#9394.
        set_if_unset("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        if !has_drm_render_node() {
            set_if_unset("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }
}

#[cfg(target_os = "linux")]
fn set_if_unset(key: &str, value: &str) {
    if std::env::var_os(key).is_none() {
        std::env::set_var(key, value);
    }
}

#[cfg(target_os = "linux")]
fn has_drm_render_node() -> bool {
    std::fs::read_dir("/dev/dri").ok().is_some_and(|entries| {
        entries.filter_map(Result::ok).any(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            name.starts_with("card") || name.starts_with("renderD")
        })
    })
}
