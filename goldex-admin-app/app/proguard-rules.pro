# Retrofit/OkHttp/Gson keep rules — the app is small enough that shrinking it
# buys little, but these stop a release build silently breaking deserialisation.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keep class com.goldex.admin.data.** { *; }
-dontwarn okhttp3.**
-dontwarn retrofit2.**
