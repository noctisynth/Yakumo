use super::{ProtocolResult, invalid};
use serde_json::Value;

pub fn omit_object_nulls(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(_, value)| !value.is_null())
                .map(|(key, value)| (key.clone(), omit_object_nulls(value)))
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.iter().map(omit_object_nulls).collect()),
        _ => value.clone(),
    }
}

fn float_text(value: f64) -> ProtocolResult<String> {
    if !value.is_finite() {
        return Err(invalid());
    }
    if value == 0.0 {
        return Ok(if value.is_sign_negative() {
            "-0.0"
        } else {
            "0.0"
        }
        .into());
    }
    let negative = value.is_sign_negative();
    let mut buffer = ryu::Buffer::new();
    let shortest = buffer.format_finite(value.abs());
    let (mantissa, exponent) = shortest.split_once('e').unwrap_or((shortest, "0"));
    let exponent = exponent.parse::<i32>().map_err(|_| invalid())?;
    let decimal = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let raw = mantissa.replace('.', "");
    let first = raw
        .bytes()
        .position(|byte| byte != b'0')
        .ok_or_else(invalid)?;
    let digits = raw[first..].trim_end_matches('0');
    let position = decimal + exponent - first as i32;
    let mut result = if (-3..=15).contains(&position) {
        if position <= 0 {
            format!("0.{}{}", "0".repeat((-position) as usize), digits)
        } else if position >= digits.len() as i32 {
            format!(
                "{}{}.0",
                digits,
                "0".repeat(position as usize - digits.len())
            )
        } else {
            format!(
                "{}.{}",
                &digits[..position as usize],
                &digits[position as usize..]
            )
        }
    } else {
        let tail = if digits.len() > 1 {
            format!(".{}", &digits[1..])
        } else {
            String::new()
        };
        let exp = position - 1;
        format!(
            "{}{tail}e{}{:02}",
            &digits[..1],
            if exp < 0 { '-' } else { '+' },
            exp.abs()
        )
    };
    if negative {
        result.insert(0, '-');
    }
    Ok(result)
}

pub fn native_json(value: &Value) -> ProtocolResult<String> {
    fn write(value: &Value, output: &mut String, depth: usize) -> ProtocolResult<()> {
        if depth > 64 {
            return Err(invalid());
        }
        match value {
            Value::Null => output.push_str("null"),
            Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
            Value::String(value) => {
                output.push_str(&serde_json::to_string(value).map_err(|_| invalid())?)
            }
            Value::Number(value) => {
                let text = value.to_string();
                if text.contains(['.', 'e', 'E']) {
                    output.push_str(&float_text(text.parse().map_err(|_| invalid())?)?);
                } else {
                    if text.parse::<i64>().is_err() && text.parse::<u64>().is_err() {
                        return Err(invalid());
                    }
                    output.push_str(&text);
                }
            }
            Value::Array(values) => {
                output.push('[');
                for (index, value) in values.iter().enumerate() {
                    if index > 0 {
                        output.push(',');
                    }
                    write(value, output, depth + 1)?;
                }
                output.push(']');
            }
            Value::Object(values) => {
                output.push('{');
                let ordered: std::collections::BTreeMap<_, _> = values.iter().collect();
                for (index, (key, value)) in ordered.iter().enumerate() {
                    if index > 0 {
                        output.push(',');
                    }
                    output.push_str(&serde_json::to_string(key).map_err(|_| invalid())?);
                    output.push(':');
                    write(value, output, depth + 1)?;
                }
                output.push('}');
            }
        }
        Ok(())
    }
    let mut output = String::new();
    write(value, &mut output, 0)?;
    Ok(output)
}
