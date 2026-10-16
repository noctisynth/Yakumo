use serde_json::Value;

/// The original client reads list settings both as arrays and as JSON text.
/// Missing or malformed settings must not silently mean "no requirement".
pub(super) fn array(value: &Value) -> Option<Vec<Value>> {
    match value {
        Value::Array(values) => Some(values.clone()),
        Value::String(text) if text.len() <= 64 * 1024 => {
            serde_json::from_str::<Vec<Value>>(text).ok()
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn array_and_single_encoded_array_preserve_values() {
        let data = json!([[{"lat":"0.1","lng":0.2,"extra":"kept"}]]);
        assert_eq!(array(&data), array(&Value::String(data.to_string())));
        assert_eq!(array(&json!(" \n [] ")), Some(vec![]));
        for invalid in [
            Value::Null,
            json!({}),
            json!("null"),
            json!(""),
            json!("\"[]\""),
            json!("[broken"),
        ] {
            assert!(array(&invalid).is_none());
        }
    }
}
